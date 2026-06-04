<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use App\Services\NotificationService;

class MonitorLowActivity extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'timelogs:monitor-activity';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Monitor active time logs for zero activity and notify via Telegram';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $botToken = Setting::get('telegram_bot_token', env('TELEGRAM_BOT_TOKEN'));
        $idleMinutesRaw = Setting::get('idle_no_movement_minutes', env('IDLE_NO_MOVEMENT_MINUTES', 5));
        $idleMinutes = max(1, (int) $idleMinutesRaw);
        $cooldownSecondsRaw = Setting::get('idle_no_movement_cooldown_seconds', env('IDLE_NO_MOVEMENT_COOLDOWN_SECONDS', 1800));
        $cooldownSeconds = max(60, (int) $cooldownSecondsRaw);
        $notificationService = app(NotificationService::class);

        // 1. Find users with active time logs updated in the last 15 minutes
        //    Also include logs that were recently closed (by StopGhostTimeLogs) to avoid race condition
        $activeLogs = TimeLog::with(['user', 'project', 'task'])
            ->where(function ($q) {
                $q->whereNull('end_time') // Still running
                  ->orWhere('end_time', '>', Carbon::now()->subMinutes(2)); // Recently closed (ghost stopper)
            })
            ->where('updated_at', '>', Carbon::now()->subMinutes(15))
            ->get();

        foreach ($activeLogs as $log) {
            $user = $log->user;

            if (!$user || $user->role !== 'employee') {
                continue;
            }
            
            // Admin idle alert should only apply to actively running logs
            if (!is_null($log->end_time)) {
                continue;
            }

            // 2. Get the latest screenshot for this time log
            $latestScreenshot = Screenshot::where('time_log_id', $log->id)
                ->latest('captured_at')
                ->first();

            if (!$latestScreenshot || !$latestScreenshot->minute_breakdown) {
                continue;
            }

            $anchor = $latestScreenshot->captured_at ? Carbon::parse($latestScreenshot->captured_at) : Carbon::now();
            $windowStart = $anchor->copy()->subMinutes($idleMinutes)->subSeconds(30);
            $windowEnd = $anchor->copy()->addSeconds(30);

            $recentShots = Screenshot::where('time_log_id', $log->id)
                ->whereNotNull('minute_breakdown')
                ->whereBetween('captured_at', [$windowStart->copy()->subMinutes(2), $windowEnd->copy()->addMinutes(2)])
                ->orderBy('captured_at', 'desc')
                ->take(25)
                ->get(['minute_breakdown', 'captured_at']);

            $minuteActivity = [];
            $rangeStart = null;
            $rangeEnd = null;
            foreach ($recentShots as $shot) {
                $breakdown = $shot->minute_breakdown;
                if (!is_array($breakdown)) continue;

                foreach ($breakdown as $entry) {
                    if (!is_array($entry) || !isset($entry['timestamp'])) continue;

                    try {
                        $ts = Carbon::parse((string) $entry['timestamp']);
                    } catch (\Throwable $e) {
                        continue;
                    }

                    if ($ts->lt($windowStart) || $ts->gt($windowEnd)) continue;

                    $key = $ts->format('Y-m-d H:i');
                    $a = 0;
                    $a += (int) ($entry['keyboard_clicks'] ?? 0);
                    $a += (int) ($entry['mouse_clicks'] ?? 0);
                    $a += (int) ($entry['mouse_scrolls'] ?? 0);
                    $a += (int) ($entry['mouse_movements'] ?? 0);
                    if (isset($entry['total_activity'])) {
                        $a = max($a, (int) $entry['total_activity']);
                    }

                    $minuteActivity[$key] = max($minuteActivity[$key] ?? 0, $a);
                    if (!$rangeStart || $ts->lt($rangeStart)) {
                        $rangeStart = $ts;
                    }
                    if (!$rangeEnd || $ts->gt($rangeEnd)) {
                        $rangeEnd = $ts;
                    }
                }
            }

            if (count($minuteActivity) < $idleMinutes) {
                continue;
            }

            $total = array_sum($minuteActivity);
            if ($total !== 0) {
                continue;
            }

            $rangeStartStr = $rangeStart instanceof Carbon ? $rangeStart->toIso8601String() : $windowStart->toIso8601String();
            $rangeEndStr = $rangeEnd instanceof Carbon ? $rangeEnd->toIso8601String() : $windowEnd->toIso8601String();

            $cacheKey = "idle_no_movement_admin_{$user->id}_{$log->id}_" . md5($rangeStartStr . '|' . $rangeEndStr . '|' . $idleMinutes);
            if (Cache::has($cacheKey)) {
                continue;
            }

            $projectName = $log->project?->name ?? 'N/A';
            $taskTitle = $log->task?->title ?? 'N/A';
            $title = "⚠️ No Movement Detected";
            $message = "No movement detected for {$user->name} in the last {$idleMinutes} minutes (tracking is ON).";

            $notificationService->sendToAdmins(
                'idle_no_movement',
                'tracking',
                $title,
                $message,
                [
                    'user_id' => $user->id,
                    'user_name' => $user->name,
                    'time_log_id' => $log->id,
                    'project_id' => $log->project_id,
                    'project_name' => $projectName,
                    'task_id' => $log->task_id,
                    'task_title' => $taskTitle,
                    'idle_minutes' => $idleMinutes,
                    'range_start' => $rangeStartStr,
                    'range_end' => $rangeEndStr,
                    'samples' => count($minuteActivity),
                ],
                $user->id,
                '⚠️'
            );

            Cache::put($cacheKey, true, $cooldownSeconds);
            $this->info("Idle movement alert sent to admins for {$user->name} (Log {$log->id})");

            // Optional: Telegram alert to employee (only if configured)
            if ($botToken && !empty($user->telegram_chat_id)) {
                $tgMessage = "⚠️ Alert\nAapki last {$idleMinutes} minute se koi activity detect nahi hui hai. Agar aap kaam kar rahe hain to tracker active rakhein.";
                $this->sendToChat($botToken, $user->telegram_chat_id, $tgMessage);
            }
        }
    }

    /**
     * Send message to Telegram chat
     */
    private function sendToChat($botToken, $chatId, $message)
    {
        try {
            Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $message,
                // Using basic text as requested, no Markdown needed for this specific message
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to send activity alert to Telegram ' . $chatId . ': ' . $e->getMessage());
        }
    }
}
