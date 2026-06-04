<?php

namespace App\Console\Commands;

use App\Events\MeetingReminder;
use App\Models\Meeting;
use App\Services\NotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SendMeetingReminders extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'meetings:remind';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send reminders for upcoming meetings';

    protected NotificationService $notificationService;

    /**
     * Create a new command instance.
     */
    public function __construct(NotificationService $notificationService)
    {
        parent::__construct();
        $this->notificationService = $notificationService;
    }

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $now = Carbon::now();

        // Get scheduled meetings in the next 20 minutes
        $meetings = Meeting::where('status', 'scheduled')
            ->whereBetween('scheduled_at', [
                $now->copy()->subMinutes(2),
                $now->copy()->addMinutes(20)
            ])
            ->with(['creator', 'participants'])
            ->get();

        foreach ($meetings as $meeting) {
            $scheduledAt = $meeting->scheduled_at;
            $diffInMinutes = (int) round($now->diffInMinutes($scheduledAt, false));

            // We support reminders at 15 minutes, 5 minutes, and 0 minutes (starting now)
            $reminderIntervals = [15, 5, 0];

            foreach ($reminderIntervals as $interval) {
                // Check if the diff is within a 1-minute window of the interval
                if ($diffInMinutes === $interval) {
                    $cacheKey = "meeting_reminder_{$meeting->id}_{$interval}";

                    if (!Cache::has($cacheKey)) {
                        $timeString = $interval === 0 ? "starts now" : "starts in {$interval} minutes";
                        
                        // Broadcast MeetingReminder Event
                        try {
                            broadcast(new MeetingReminder($meeting, $timeString))->toOthers();
                        } catch (\Exception $e) {
                            Log::warning('Failed to broadcast MeetingReminder: ' . $e->getMessage());
                        }

                        // Send notifications to all participants
                        foreach ($meeting->participants as $participant) {
                            $title = $interval === 0 ? "Meeting Starting Now" : "Meeting starting in {$interval}m";
                            $message = "The meeting '{$meeting->title}' is scheduled to start " . ($interval === 0 ? "now" : "in {$interval} minutes") . ".";
                            
                            $this->notificationService->sendToUser(
                                $participant->id,
                                'meeting_reminder',
                                'meeting',
                                $title,
                                $message,
                                [
                                    'meeting_id' => $meeting->id,
                                    'interval' => $interval
                                ],
                                $meeting->created_by
                            );
                        }

                        Cache::put($cacheKey, true, now()->addMinutes(30));
                    }
                }
            }
        }

        return Command::SUCCESS;
    }
}
