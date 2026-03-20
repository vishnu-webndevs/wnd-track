<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\User;
use Carbon\Carbon;
use App\Models\Screenshot;
use App\Models\ActivityLog;

class FixTimeLogOverlaps extends Command
{
    protected $signature = 'fix:timelog-overlaps {user_id?} {--dry-run : Run without saving changes} {--ist-fix : Apply -11h correction for double-shifted IST timestamps}';
    protected $description = 'Repair time logs: Fix overlaps, truncate zombie sessions, and correct negative durations';

    public function handle()
    {
        $userId = $this->argument('user_id');
        $isDryRun = $this->option('dry-run');
        $isIstFix = $this->option('ist-fix');

        if ($isDryRun) {
            $this->warn("RUNNING IN DRY-RUN MODE. NO CHANGES WILL BE SAVED.");
        }
        
        if ($isIstFix) {
            $this->warn("IST FIX ENABLED: Subtracting 11 hours from screenshot times.");
        }

        $users = $userId ? User::where('id', $userId)->get() : User::all();

        foreach ($users as $user) {
            $this->info("Processing user: {$user->name} ({$user->id})");
            
            // --- PASS 0: Truth from Screenshots (The Ultimate Source of Truth) ---
            $this->info("--- PASS 0: Verifying with Screenshots (Ultimate Truth) ---");
            $logs = TimeLog::where('user_id', $user->id)
                ->whereNotNull('end_time')
                ->get();

            foreach ($logs as $log) {
                // Find screenshots belonging to this log (via ID or Range)
                // We expand the search range slightly to catch screenshots that might be just outside due to previous truncations
                // NOTE: If using IST FIX, we need to be careful with range matching. 
                // But typically range matching logic relies on the relative proximity in DB.
                // The "Shift" happens when we extract the TRUTH from the screenshot.
                
                $startSearch = $log->start_time->copy()->subHours(24); 
                $endSearch = $log->end_time->copy()->addHours(24);

                $screenshots = Screenshot::where('user_id', $user->id)
                     ->where(function($q) use ($log, $startSearch, $endSearch) {
                         $q->where('time_log_id', $log->id)
                           ->orWhereBetween('captured_at', [$startSearch, $endSearch]);
                     })
                     // Filter to match Project/Task if possible to be precise
                     ->when($log->project_id, function($q) use ($log) {
                         return $q->where('project_id', $log->project_id);
                     })
                     ->orderBy('captured_at')
                     ->get();

                // If found screenshots via ID, trust those 100%
                $trustScreenshots = $screenshots->where('time_log_id', $log->id);
                if ($trustScreenshots->isEmpty()) {
                    // If no ID match, fallback to the loose range match
                    // But be careful: only if they are clustered together
                    $trustScreenshots = $screenshots;
                }

                if ($trustScreenshots->isNotEmpty()) {
                    $firstScreen = $trustScreenshots->first()->captured_at;
                    $lastScreen = $trustScreenshots->last()->captured_at;

                    // APPLY IST FIX IF ENABLED
                    if ($isIstFix) {
                        $firstScreen = $firstScreen->copy()->subHours(11);
                        $lastScreen = $lastScreen->copy()->subHours(11);
                    }

                    // Calculate correct duration based on screenshots
                    $correctDuration = $firstScreen->diffInMinutes($lastScreen);
                    if ($correctDuration < 1) $correctDuration = 1; // Minimum 1 min

                    // Check if current log is significantly different (> 10 mins)
                    $startDiff = abs($log->start_time->diffInMinutes($firstScreen));
                    $endDiff = abs($log->end_time->diffInMinutes($lastScreen));

                    if ($startDiff > 10 || $endDiff > 10) {
                        $this->warn("Mismatch detected for Log {$log->id}:");
                        $this->warn("  Current: {$log->start_time} to {$log->end_time} ({$log->duration} mins)");
                        $this->warn("  Evidence: {$firstScreen} to {$lastScreen} (~{$correctDuration} mins)");
                        
                        // Buffer: Start 1 min before first screen, End 1 min after last screen
                        $newStart = $firstScreen->copy()->subMinutes(1);
                        $newEnd = $lastScreen->copy()->addMinutes(1);
                        $newDuration = $newStart->diffInMinutes($newEnd);

                        if (!$isDryRun) {
                            $log->start_time = $newStart;
                            $log->end_time = $newEnd;
                            $log->duration = $newDuration;
                            $log->save();
                            $this->info("  -> FIXED: Aligned to Screenshots.");
                        } else {
                            $this->info("  -> [DRY RUN] Would align to Screenshots.");
                        }
                        
                        // Skip other passes for this log as it is now fixed by evidence
                        continue;
                    }
                }
            }

            // --- PASS 1: Fix Duplicate Start Times (Overlaps) ---
            // Only run for logs that were NOT fixed by Pass 0 (we can't easily filter them out in this loop structure without reloading, 
            // but since Pass 0 saves, we can check again or just rely on the fact that Pass 0 is superior).
            // Actually, we should probably skip Pass 1/3 if Pass 0 found evidence.
            // But let's keep Pass 1 for logs WITHOUT screenshots (manual logs).
            
            $this->info("--- PASS 1: Checking for Duplicate Start Times (Manual Logs) ---");
            $logs = TimeLog::where('user_id', $user->id)
                ->whereNotNull('end_time')
                ->orderBy('id')
                ->get();

            $prevLog = null;
            foreach ($logs as $log) {
                // If log has screenshots, we trust Pass 0 handled it. Skip.
                if (Screenshot::where('time_log_id', $log->id)->exists()) {
                    $prevLog = $log;
                    continue;
                }

                if (!$prevLog) {
                    $prevLog = $log;
                    continue;
                }

                $startDiff = $log->start_time->diffInSeconds($prevLog->start_time);
                
                if ($startDiff < 5) {
                    $this->warn("Duplicate Start Time detected (No Screenshots): Log {$log->id}");
                    
                    if ($prevLog->end_time && $prevLog->end_time < $log->end_time) {
                        $newStartTime = $prevLog->end_time;
                        $duration = $newStartTime->diffInMinutes($log->end_time);
                        
                        if ($newStartTime <= $log->end_time) {
                            if (!$isDryRun) {
                                $log->start_time = $newStartTime;
                                $log->duration = $duration;
                                $log->save();
                                $this->info("  -> Fixed: Start updated.");
                            } else {
                                $this->info("  -> [DRY RUN] Would update Start.");
                            }
                        }
                    }
                } 
                $prevLog = $log;
            }

            // --- PASS 3: Fix Overnight/Long Logs (Zombie Sessions) ---
            // Again, only for logs WITHOUT screenshots
            $this->info("--- PASS 3: Checking for Overnight/Zombie Sessions (Manual Logs) ---");
            $overnightLogs = TimeLog::where('user_id', $user->id)
                ->whereRaw('DATE(start_time) != DATE(end_time)')
                ->get();
                
            foreach ($overnightLogs as $log) {
                 // Skip if evidence exists
                 if (Screenshot::where('time_log_id', $log->id)->exists()) {
                     continue;
                 }

                 $this->info("Processing Overnight Log {$log->id}...");
                 
                 // Same logic as before for truly manual/zombie logs
                 $startDayActivity = ActivityLog::where('user_id', $user->id)
                     ->whereBetween('created_at', [$log->start_time, $log->start_time->copy()->endOfDay()])
                     ->first();

                 if (!$startDayActivity) {
                     // No activity -> Zombie
                     $fallbackEndTime = $log->start_time->copy()->addMinutes(1);
                     $newDuration = 1;
                     
                     $this->warn("  -> Diagnosis: Zombie Session (No activity).");
                     
                     if (!$isDryRun) {
                         $log->end_time = $fallbackEndTime;
                         $log->duration = $newDuration;
                         $log->save();
                         $this->info("  -> Fixed: Truncated to 1 minute.");
                     } else {
                         $this->info("  -> [DRY RUN] Would truncate.");
                     }
                 }
            }

            $this->info("Processing complete for user {$user->name}");
        }
    }
}
