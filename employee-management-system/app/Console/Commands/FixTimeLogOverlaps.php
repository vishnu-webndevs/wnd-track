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
    protected $signature = 'fix:timelog-overlaps {user_id?} {--dry-run : Run without saving changes}';
    protected $description = 'Repair negative duration logs by anchoring to End Time and finding first evidence';

    public function handle()
    {
        $userId = $this->argument('user_id');
        $isDryRun = $this->option('dry-run');

        if ($isDryRun) {
            $this->warn("RUNNING IN DRY-RUN MODE. NO CHANGES WILL BE SAVED.");
        }

        $query = TimeLog::query();
        if ($userId) {
            $query->where('user_id', $userId);
        }
        
        // Find logs where Start is AFTER End (Negative Duration)
        $brokenLogs = $query->whereRaw('start_time > end_time')->get();

        $this->info("Found " . $brokenLogs->count() . " broken logs (Negative Duration). Starting Repair...");

        foreach ($brokenLogs as $log) {
            $this->info("Repairing Log {$log->id}: Start {$log->start_time} > End {$log->end_time} (Duration: {$log->duration})");

            // STRATEGY: 
            // The End Time is usually the "Stop" action, so it's likely the correct date/anchor.
            // The Start Time was likely corrupted/moved forward incorrectly.
            // We will search for the EARLIEST evidence (Screenshot/Activity) on the END DATE.
            
            $targetDate = $log->end_time->copy()->startOfDay();
            $targetDateEnd = $log->end_time->copy()->endOfDay();
            
            // 1. Search for Earliest Screenshot on End Date (Matching Project/Task)
            $screenshotQuery = Screenshot::where('user_id', $log->user_id)
                ->whereBetween('created_at', [$targetDate, $targetDateEnd]);
            
            if ($log->project_id) {
                $screenshotQuery->where('project_id', $log->project_id);
            }
            
            $firstEvidence = $screenshotQuery->orderBy('created_at', 'asc')->first();
            $source = "Screenshot";

            // 2. If no screenshot, try Activity Log
            if (!$firstEvidence) {
                $activityQuery = ActivityLog::where('user_id', $log->user_id)
                    ->whereBetween('created_at', [$targetDate, $targetDateEnd]);
                
                // ActivityLog might not have project_id, but check if it does
                // Assuming it doesn't strictly link to project in all versions, we use strict time range
                // But wait, we want the START of the session.
                
                $firstEvidence = $activityQuery->orderBy('created_at', 'asc')->first();
                $source = "ActivityLog";
            }

            if ($firstEvidence) {
                // Found evidence on the correct day!
                // Set Start Time to this evidence time
                $newStartTime = $firstEvidence->created_at;
                
                // Safety: Ensure New Start is BEFORE End
                if ($newStartTime > $log->end_time) {
                    // This means evidence is after the log ended? Weird.
                    // Fallback: Just set start to 1 hour before end?
                    $newStartTime = $log->end_time->copy()->subMinutes(60); 
                    $this->warn("    Evidence found but was after End Time. Defaulting to 1 hour duration.");
                }

                $newDuration = $newStartTime->diffInMinutes($log->end_time);

                $this->info("  -> Found {$source} on End Date ({$log->end_time->format('Y-m-d')}).");
                $this->info("  -> New Start: {$newStartTime}");
                $this->info("  -> New Duration: {$newDuration} mins");

                if (!$isDryRun) {
                    $log->start_time = $newStartTime;
                    $log->duration = $newDuration;
                    $log->save();
                    $this->info("  -> FIXED.");
                } else {
                    $this->info("  -> [DRY RUN] Would Fix.");
                }

            } else {
                // No evidence found on the End Date.
                // This implies a "Ghost Log" or manual entry without tracking.
                // We cannot leave it negative.
                // Action: Set Start = End - 1 minute (Minimal valid log)
                
                $newStartTime = $log->end_time->copy()->subMinutes(1);
                $newDuration = 1;
                
                $this->warn("  -> NO EVIDENCE found on End Date. Forcing minimal duration.");
                
                if (!$isDryRun) {
                    $log->start_time = $newStartTime;
                    $log->duration = $newDuration;
                    $log->save();
                    $this->info("  -> FIXED (Minimal 1 min).");
                } else {
                    $this->info("  -> [DRY RUN] Would set to 1 min.");
                }
            }
        }
        
        $this->info("Repair Complete.");
    }
}
