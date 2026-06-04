<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use App\Models\User;
use App\Models\UserPresence;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class StopGhostTimeLogs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'timelogs:stop-ghosts';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Stop time logs that have not received a heartbeat in the last few minutes';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $activeLogs = TimeLog::whereNull('end_time')->get();
        $count = 0;

        foreach ($activeLogs as $log) {
            $now = Carbon::now();
            $lastHeartbeat = $log->updated_at;
            $diffInSeconds = $now->diffInSeconds($lastHeartbeat);

            $user = User::find($log->user_id);
            if (!$user) {
                continue;
            }

            if ($diffInSeconds >= 120) {
                // Auto-stop logic (2 minutes+)
                $bestEndTime = $log->updated_at;

                $latestScreenshot = Screenshot::where('time_log_id', $log->id)
                    ->latest('captured_at')
                    ->first();

                if ($latestScreenshot && $latestScreenshot->captured_at) {
                    $screenshotTime = Carbon::parse($latestScreenshot->captured_at);
                    if ($screenshotTime->gt($bestEndTime)) {
                        $bestEndTime = $screenshotTime;
                    }
                }

                $log->end_time = $bestEndTime;
                if ($log->start_time) {
                    $log->duration = $log->start_time->diffInMinutes($log->end_time);
                }
                $log->save();

                // Set user presence to offline and internet_connected = false
                try {
                    app(\App\Services\PresenceService::class)->updatePresence(
                        $log->user_id,
                        'offline',
                        null,
                        null,
                        false
                    );
                } catch (\Exception $e) {
                    Log::error("Presence update error on ghost stop: " . $e->getMessage());
                }

                // Send notification to employee
                try {
                    $notificationService = app(\App\Services\NotificationService::class);
                    $notificationService->sendToUser(
                        $log->user_id,
                        'tracking_auto_stopped',
                        'network',
                        '⚠️ Tracking Stopped',
                        'Tracking stopped due to internet issue',
                        [
                            'user_id' => $log->user_id,
                            'time_log_id' => $log->id,
                        ],
                        null,
                        '⚠️'
                    );
                } catch (\Exception $e) {
                    Log::error("Employee notification error on ghost stop: " . $e->getMessage());
                }

                // Send notification to admins
                try {
                    $notificationService = app(\App\Services\NotificationService::class);
                    $notificationService->sendToAdmins(
                        'tracking_auto_stopped',
                        'network',
                        '⚠️ Tracker Auto Stopped',
                        "{$user->name} tracker auto stopped",
                        [
                            'user_id' => $log->user_id,
                            'time_log_id' => $log->id,
                        ],
                        null,
                        '⚠️'
                    );
                } catch (\Exception $e) {
                    Log::error("Admin notification error on ghost stop: " . $e->getMessage());
                }

                $count++;
            } elseif ($diffInSeconds >= 75) {
                // Internet Issue logic (75 seconds - 120 seconds)
                $presence = UserPresence::where('user_id', $log->user_id)->first();
                
                if (!$presence || $presence->internet_connected) {
                    try {
                        app(\App\Services\PresenceService::class)->updatePresence(
                            $log->user_id,
                            'working',
                            $log->project_id,
                            $log->task_id,
                            false
                        );
                    } catch (\Exception $e) {
                        Log::error("Presence update error on internet issue: " . $e->getMessage());
                    }

                    // Send notification to admins
                    try {
                        $notificationService = app(\App\Services\NotificationService::class);
                        $notificationService->sendToAdmins(
                            'internet_lost',
                            'network',
                            '🌐 Connection Lost',
                            "{$user->name} lost internet connection",
                            [
                                'user_id' => $log->user_id,
                            ],
                            null,
                            '🌐'
                        );
                    } catch (\Exception $e) {
                        Log::error("Admin notification error on internet issue: " . $e->getMessage());
                    }
                }
            }
        }

        if ($count > 0) {
            $this->info("Stopped $count ghost time logs.");
        } else {
            $this->info("Checked heartbeats. No new ghost time logs stopped.");
        }
    }
}

