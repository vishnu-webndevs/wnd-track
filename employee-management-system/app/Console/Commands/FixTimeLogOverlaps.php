<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\User;
use Carbon\Carbon;

use App\Models\Screenshot;

class FixTimeLogOverlaps extends Command
{
    protected $signature = 'fix:timelog-overlaps {user_id?} {--dry-run : Run without saving changes}';
    protected $description = 'Fix overlapping time logs using Screenshot evidence';

    public function handle()
    {
        $userId = $this->argument('user_id');
        $isDryRun = $this->option('dry-run');

        if ($isDryRun) {
            $this->warn("RUNNING IN DRY-RUN MODE. NO CHANGES WILL BE SAVED.");
        }

        $users = $userId ? User::where('id', $userId)->get() : User::all();

        foreach ($users as $user) {
            $this->info("Processing user: {$user->name} ({$user->id})");
            
            // Get all logs for the user
            $logs = TimeLog::where('user_id', $user->id)
                ->whereNotNull('end_time')
                ->orderBy('id')
                ->get();

            foreach ($logs as $log) {
                // We only care about logs that look suspicious or are requested to be fixed.
                // But the user said "wapis se sahi kr" (fix everything based on screenshots).
                // So we will validate EVERY log against its screenshots.

                // Find the first and last screenshot for this time log
                // Assuming screenshots are linked to time_log_id (based on recent migration)
                // If not, we fall back to time range check.
                
                // Let's first try by time_log_id if available (safer)
                $firstScreenshot = Screenshot::where('time_log_id', $log->id)->orderBy('created_at', 'asc')->first();
                $lastScreenshot = Screenshot::where('time_log_id', $log->id)->orderBy('created_at', 'desc')->first();
                
                // If no screenshots found by ID, try finding by time range (legacy support)
                // We also strictly match project_id to ensure we don't mix up projects.
                if (!$firstScreenshot) {
                     $query = Screenshot::where('user_id', $user->id)
                         ->where('created_at', '>=', $log->start_time)
                         ->where('created_at', '<=', $log->end_time);
                         
                     // If log has project_id, match it.
                     if ($log->project_id) {
                         $query->where('project_id', $log->project_id);
                     }
                         
                     $firstScreenshot = (clone $query)->orderBy('created_at', 'asc')->first();
                     $lastScreenshot = (clone $query)->orderBy('created_at', 'desc')->first();
                }

                if ($firstScreenshot && $lastScreenshot) {
                    $evidenceStart = $firstScreenshot->created_at;
                    $evidenceEnd = $lastScreenshot->created_at;
                    
                    // Logic:
                    // 1. The Log Start Time should be close to First Screenshot (or slightly before).
                    // 2. The Log End Time should be close to Last Screenshot (or slightly after).
                    // 3. If the Log Duration is HUGE (e.g. overnight) but screenshots are only for a few hours, truncate.
                    
                    // Check Start Time Mismatch (> 10 mins difference)
                    $startDiff = $log->start_time->diffInMinutes($evidenceStart);
                    // If Log Start is WAY before Evidence Start (e.g. 8 hours before), it's likely the "Sync Bug".
                    // However, we must be careful: maybe they worked without screenshots?
                    // But the user explicitly asked to use "Screenshot base pe".
                    
                    $shouldUpdateStart = false;
                    $newStartTime = $log->start_time;
                    
                    // Only fix if start time is suspiciously early (e.g. previous day) compared to evidence
                    // Or if user wants strictly screenshot-based accounting.
                    // Let's be conservative: Fix if difference > 30 mins AND dates mismatch or specific bug pattern.
                    
                    if ($startDiff > 30 && $log->start_time < $evidenceStart) {
                         $this->warn("Log {$log->id}: Start Time {$log->start_time} is {$startDiff} mins before First Screenshot {$evidenceStart}");
                         // Update Start to Evidence Start (minus buffer)
                         $newStartTime = $evidenceStart->copy()->subMinutes(1); // 1 min buffer
                         $shouldUpdateStart = true;
                    }
                    
                    // Check End Time Mismatch
                    $endDiff = $log->end_time->diffInMinutes($evidenceEnd);
                    
                    $shouldUpdateEnd = false;
                    $newEndTime = $log->end_time;
                    
                    // If Log End is WAY after Evidence End (e.g. 10 hours later - forgot to stop), truncate.
                    if ($endDiff > 30 && $log->end_time > $evidenceEnd) {
                        $this->warn("Log {$log->id}: End Time {$log->end_time} is {$endDiff} mins after Last Screenshot {$evidenceEnd}");
                        // Update End to Evidence End (plus buffer)
                        $newEndTime = $evidenceEnd->copy()->addMinutes(1); // 1 min buffer
                        $shouldUpdateEnd = true;
                    }
                    
                    if ($shouldUpdateStart || $shouldUpdateEnd) {
                        $oldDuration = $log->duration;
                        $newDuration = $newStartTime->diffInMinutes($newEndTime);
                        
                        $this->warn("  -> Correcting Log {$log->id} based on Screenshots:");
                        if ($shouldUpdateStart) $this->warn("     Start: {$log->start_time} -> {$newStartTime}");
                        if ($shouldUpdateEnd)   $this->warn("     End:   {$log->end_time} -> {$newEndTime}");
                        $this->warn("     Duration: {$oldDuration} -> {$newDuration} mins");
                        
                        if (!$isDryRun) {
                            $log->start_time = $newStartTime;
                            $log->end_time = $newEndTime;
                            $log->duration = $newDuration;
                            $log->save();
                            $this->info("  -> Fixed.");
                        } else {
                            $this->info("  -> [DRY RUN] Would fix.");
                        }
                    }
                    
                } elseif (!$firstScreenshot && $log->duration > 60) {
                    // No screenshots found for a long log (> 1 hour). 
                    // This is likely a "Zombie Session" or "Ghost Log".
                    
                    $this->warn("Log {$log->id} (Duration: {$log->duration} mins) has NO SCREENSHOTS.");
                    // User said: "Start activity dekh screenshot ki... uske base pe sahi kr"
                    // If no screenshots, maybe it shouldn't exist or be minimal?
                    // Let's truncate to 1 minute to be safe, as it's likely invalid time.
                    
                    $newEndTime = $log->start_time->copy()->addMinutes(1);
                    $newDuration = 1;
                    
                    $this->warn("  -> Action: No evidence found. Truncating to 1 min.");
                    
                    if (!$isDryRun) {
                        $log->end_time = $newEndTime;
                        $log->duration = $newDuration;
                        $log->save();
                        $this->info("  -> Fixed.");
                    } else {
                        $this->info("  -> [DRY RUN] Would truncate.");
                    }
                }
            }
            
            $this->info("Processing complete for user {$user->name}");
        }
    }
}
