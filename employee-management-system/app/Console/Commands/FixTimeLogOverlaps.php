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

            // PASS 3: Smart Fix for Overnight/Multi-day Logs
            // Distinguishes between "Forgot to Stop" vs "Buggy Start Time"
            
            $this->info("Analyzing overnight logs to decide between 'Forgot to Stop' vs 'Buggy Start'...");
            
            $overnightLogs = TimeLog::where('user_id', $user->id)
                ->whereRaw('DATE(start_time) != DATE(end_time)')
                ->get();
                
            foreach ($overnightLogs as $log) {
                 $this->info("Processing Overnight Log {$log->id}: {$log->start_time} to {$log->end_time}");
                 
                 // Check for activity on the END date
                 $endDayActivity = \App\Models\ActivityLog::where('user_id', $user->id)
                     ->where('created_at', '>=', $log->end_time->copy()->startOfDay())
                     ->where('created_at', '<=', $log->end_time)
                     ->orderBy('created_at', 'asc')
                     ->first();
                     
                 // Check for activity on the START date (after start time)
                 $startDayActivity = \App\Models\ActivityLog::where('user_id', $user->id)
                     ->where('created_at', '>=', $log->start_time)
                     ->where('created_at', '<=', $log->start_time->copy()->endOfDay())
                     ->orderBy('created_at', 'desc') // Last activity of start day
                     ->first();

                 if ($endDayActivity) {
                     // We have activity on the end day. 
                     // This strongly suggests this log captures valid work on the End Day, 
                     // but has a Wrong Start Time (inherited from previous day due to bug).
                     
                     // ACTION: Move Start Time forward to the first activity of the End Day
                     // But we should be careful not to lose the Start Day work if it was a valid multi-day shift.
                     // However, given the bug context, it's likely two separate sessions merged.
                     // The safe bet is to split it? Or just move start if Start Day activity is negligible/covered by other logs.
                     
                     // Let's assume it's the "Sync Bug" where Start Time was copied from yesterday.
                     // We update Start Time to the first activity of the End Day.
                     
                     $newStartTime = $endDayActivity->created_at;
                     // Add a small buffer backwards (e.g. 2 mins) just in case
                     $newStartTime->subMinutes(2);
                     
                     // Recalculate duration
                     $newDuration = $newStartTime->diffInMinutes($log->end_time);
                     
                     $this->warn("  -> Diagnosis: Buggy Start Time (Activity found on End Day).");
                     $this->warn("  -> Action: Moving Start Time from {$log->start_time} to {$newStartTime}");
                     
                     $log->start_time = $newStartTime;
                     $log->duration = $newDuration;
                     $log->save();
                     
                 } elseif ($startDayActivity) {
                     // No activity on End Day, but activity on Start Day.
                     // This is the "Forgot to Stop" scenario.
                     
                     $realEndTime = $startDayActivity->created_at;
                     $realEndTime->addMinutes(10); // Buffer
                     
                     // Ensure valid range
                     if ($realEndTime > $log->end_time) $realEndTime = $log->end_time;
                     
                     $newDuration = $log->start_time->diffInMinutes($realEndTime);
                     
                     $this->warn("  -> Diagnosis: Forgot to Stop (No activity on End Day).");
                     $this->warn("  -> Action: Truncating End Time from {$log->end_time} to {$realEndTime}");
                     
                     $log->end_time = $realEndTime;
                     $log->duration = $newDuration;
                     $log->save();
                 } else {
                     $this->error("  -> Unable to determine fix (No activity found). Skipping.");
                 }
            }
            
            $this->info("Processing complete for user {$user->name}");
        }
    }
}
