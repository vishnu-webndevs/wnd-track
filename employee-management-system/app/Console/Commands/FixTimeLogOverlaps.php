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

            /*
            // PASS 2: Fix Inconsistent Durations (Duration != End - Start)
            // DISABLED: This might remove valid idle time calculations.
            // Only enable if you are sure duration should strictly be End - Start.
            
            $this->info("Checking for duration mismatches...");
            $mismatchCount = 0;
            foreach ($logs as $log) {
                if ($log->end_time && $log->start_time) {
                    $calculatedDuration = $log->start_time->diffInMinutes($log->end_time);
                    
                    // Allow 1-2 minutes tolerance for seconds rounding
                    if (abs($log->duration - $calculatedDuration) > 2) {
                        $this->warn("Duration Mismatch detected: Log {$log->id} has Duration {$log->duration} but Start-End diff is {$calculatedDuration}");
                        
                        // $log->duration = $calculatedDuration;
                        // $log->save();
                        
                        // $this->info("  -> Fixed: Duration updated to {$calculatedDuration}");
                        // $mismatchCount++;
                    }
                }
            }
            $this->info("Fixed $mismatchCount duration mismatches for user {$user->name}");
            */

            // PASS 3: Detect and Fix "Impossible" Long Durations (e.g. overnight/multi-day)
            // Logic: If duration > 16 hours (960 mins), it's likely an error (forgot to stop tracker).
            // We will truncate it to the last known activity time or a safe max (e.g. 1 hour after start).
            
            $this->info("Checking for suspiciously long durations (forgot-to-stop scenario)...");
            $longLogCount = 0;
            
            // Check for logs longer than 12 hours (720 mins) to catch more cases
            $longLogs = TimeLog::where('user_id', $user->id)
                ->where('duration', '>', 720) 
                ->get();
                
            foreach ($longLogs as $log) {
                 $this->warn("Suspicious Long Duration detected: Log {$log->id} is {$log->duration} mins ({$log->start_time} to {$log->end_time})");
                 
                 // Try to find the LAST activity log for this time log to determine real end time
                 // We look for activity that happened AFTER start time, but BEFORE the crazy end time.
                 // We want the last activity that happened on the SAME DAY as the start time (assuming no overnight shifts)
                 
                 $sameDayEnd = (clone $log->start_time)->endOfDay();
                 
                 $lastActivity = \App\Models\ActivityLog::where('user_id', $user->id)
                     ->where('created_at', '>=', $log->start_time)
                     ->where('created_at', '<=', $log->end_time) // Look within the recorded range
                     ->orderBy('created_at', 'desc')
                     ->first();
                 
                 // If the last activity is on a DIFFERENT day than start time, it means they might have worked overnight OR (more likely) just logged in next morning.
                 // Let's check if there is a HUGE GAP (e.g. > 4 hours) between activities.
                 
                 if ($lastActivity) {
                     $realEndTime = $lastActivity->created_at;
                     
                     // If the real end time found is surprisingly close to the "buggy" end time (e.g. next morning),
                     // we need to see if there was a big gap before it.
                     // But simpler logic: If duration is > 12 hours, just cut it at the last activity of the START DAY.
                     
                     if ($realEndTime->diffInHours($log->start_time) > 12) {
                         // Find last activity of the START DAY
                         $lastActivityDay = \App\Models\ActivityLog::where('user_id', $user->id)
                             ->where('created_at', '>=', $log->start_time)
                             ->where('created_at', '<=', $sameDayEnd)
                             ->orderBy('created_at', 'desc')
                             ->first();
                             
                         if ($lastActivityDay) {
                             $realEndTime = $lastActivityDay->created_at;
                             $this->warn("  -> Found activity on next day, but assuming work ended on start day at {$realEndTime}");
                         }
                     }

                     // Add a buffer (e.g. 10 mins) to account for reading time
                     $realEndTime->addMinutes(10);
                     
                     // Ensure we don't go past the original end time
                     if ($realEndTime > $log->end_time) {
                         $realEndTime = $log->end_time;
                     }
                     
                     $newDuration = $log->start_time->diffInMinutes($realEndTime);
                     
                     if ($newDuration < $log->duration) {
                        $log->end_time = $realEndTime;
                        $log->duration = $newDuration;
                        $log->save();
                        
                        $this->info("  -> Fixed: Truncated to last activity at {$realEndTime}, New Duration: {$newDuration} mins");
                        $longLogCount++;
                     }
                 } else {
                     // If no activity logs found AT ALL, maybe cut at 8 hours?
                     // Or check if it spans multiple days
                     if ($log->start_time->format('Y-m-d') != $log->end_time->format('Y-m-d')) {
                         // Spans multiple days and no activity found?
                         // Cut it at end of start day?
                         // Let's be safe and just warn for now if no activity found.
                         $this->error("  -> No activity logs found to verify true end time. Manual review needed.");
                     }
                 }
            }
            $this->info("Fixed $longLogCount long duration logs for user {$user->name}");
            
            $this->info("Processing complete for user {$user->name}");
        }
    }
}
