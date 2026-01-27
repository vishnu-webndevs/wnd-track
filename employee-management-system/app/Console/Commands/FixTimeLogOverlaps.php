<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\User;
use Carbon\Carbon;

class FixTimeLogOverlaps extends Command
{
    protected $signature = 'fix:timelog-overlaps {user_id?}';
    protected $description = 'Fix overlapping time logs caused by the sync bug';

    public function handle()
    {
        $userId = $this->argument('user_id');

        $users = $userId ? User::where('id', $userId)->get() : User::all();

        foreach ($users as $user) {
            $this->info("Processing user: {$user->name} ({$user->id})");
            
            // Get logs ordered by ID (creation sequence)
            // limiting to recent logs to avoid messing up old history if not needed, 
            // but the user didn't specify. Let's do all, or maybe last 30 days.
            // The user said "kl" (yesterday), so recent is enough.
            // Let's do all for completeness, but safety first.
            
            $logs = TimeLog::where('user_id', $user->id)
                ->whereNotNull('end_time')
                ->orderBy('id')
                ->get();

            $count = 0;
            $prevLog = null;

            foreach ($logs as $log) {
                if (!$prevLog) {
                    $prevLog = $log;
                    continue;
                }

                // Check if start_time is exactly the same as previous log's start_time
                // allowing for small difference (e.g. 1 second) just in case
                $startDiff = $log->start_time->diffInSeconds($prevLog->start_time);
                
                if ($startDiff < 5) {
                    // Strong indicator of the bug
                    $this->warn("Duplicate Start Time detected: Log {$log->id} starts at {$log->start_time}, Prev {$prevLog->id} starts at {$prevLog->start_time}");
                    
                    // The correct start time for this log should be the end time of the previous log
                    // BUT we must ensure that makes sense (i.e., prevLog ended before this log ended)
                    if ($prevLog->end_time && $prevLog->end_time < $log->end_time) {
                        $newStartTime = $prevLog->end_time;
                        $duration = $newStartTime->diffInMinutes($log->end_time);
                        
                        // Update
                        $log->start_time = $newStartTime;
                        $log->duration = $duration;
                        $log->save();
                        
                        $this->info("  -> Fixed: Start updated to {$newStartTime}, Duration: {$duration} mins");
                        $count++;
                    } else {
                        $this->error("  -> Skipping: Previous log ends after current log ends, or invalid.");
                    }
                } 
                // Also check for general overlap where start < prev->end
                elseif ($log->start_time < $prevLog->end_time) {
                     $this->warn("Overlap detected: Log {$log->id} starts {$log->start_time} before Prev {$prevLog->id} ends {$prevLog->end_time}");
                     
                     // If it's a pure overlap (not same start), we might trim it?
                     // For now, let's stick to the specific bug fix (duplicate start) unless requested otherwise.
                     // The user's issue "16.32 vs 8" is almost certainly the duplicate start (double counting).
                }

                $prevLog = $log;
            }

            // PASS 2: Fix Inconsistent Durations (Duration != End - Start)
            $this->info("Checking for duration mismatches...");
            $mismatchCount = 0;
            foreach ($logs as $log) {
                if ($log->end_time && $log->start_time) {
                    $calculatedDuration = $log->start_time->diffInMinutes($log->end_time);
                    
                    // Allow 1-2 minutes tolerance for seconds rounding
                    if (abs($log->duration - $calculatedDuration) > 2) {
                        $this->warn("Duration Mismatch detected: Log {$log->id} has Duration {$log->duration} but Start-End diff is {$calculatedDuration}");
                        
                        $log->duration = $calculatedDuration;
                        $log->save();
                        
                        $this->info("  -> Fixed: Duration updated to {$calculatedDuration}");
                        $mismatchCount++;
                    }
                }
            }
            $this->info("Fixed $mismatchCount duration mismatches for user {$user->name}");

            $this->info("Processing complete for user {$user->name}");
        }
    }
}
