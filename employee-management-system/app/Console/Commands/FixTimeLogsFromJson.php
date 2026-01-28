<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use Carbon\Carbon;

class FixTimeLogsFromJson extends Command
{
    protected $signature = 'fix:timelogs-from-json {--dry-run : Run without saving changes}';
    protected $description = 'Restore correct TimeLog and Screenshot timestamps using the valid JSON data in minute_breakdown';

    public function handle()
    {
        $isDryRun = $this->option('dry-run');

        if ($isDryRun) {
            $this->warn("RUNNING IN DRY-RUN MODE. NO CHANGES WILL BE SAVED.");
        }

        $this->info("Starting restoration of timestamps from JSON data...");

        $screenshots = Screenshot::whereNotNull('minute_breakdown')->get();
        $fixedScreenshots = 0;
        $fixedLogs = 0;

        // 1. Fix Screenshots first
        foreach ($screenshots as $screenshot) {
            $json = $screenshot->minute_breakdown;
            
            // If it's a string, decode it
            if (is_string($json)) {
                $data = json_decode($json, true);
            } else {
                $data = $json;
            }

            if (!is_array($data) || empty($data)) {
                continue;
            }

            // Extract valid timestamps from JSON
            $timestamps = [];
            foreach ($data as $item) {
                if (isset($item['timestamp'])) {
                    try {
                        $timestamps[] = Carbon::parse($item['timestamp']);
                    } catch (\Exception $e) {
                        // ignore invalid dates
                    }
                }
            }

            if (empty($timestamps)) {
                continue;
            }

            // The screenshot "captured_at" should ideally be the latest time in the activity + some seconds
            // or at least close to it.
            // Let's pick the max timestamp found in the JSON.
            $maxTime = collect($timestamps)->max();

            if (!$maxTime) continue;

            // Current captured_at
            $currentCapturedAt = Carbon::parse($screenshot->captured_at);

            // Check difference. If > 5 hours (approx 5.5h shift), then fix it.
            // Or just trust the JSON blindly?
            // User says "json me time sahi tha" (JSON time was correct).
            // So we TRUST JSON.
            
            // However, let's only fix if the difference is significant (> 30 mins)
            // to avoid minor drifts.
            $diffInMinutes = $currentCapturedAt->diffInMinutes($maxTime);

            if ($diffInMinutes > 30) {
                $this->info("Screenshot {$screenshot->id} Mismatch: DB={$currentCapturedAt} vs JSON={$maxTime}");
                
                if (!$isDryRun) {
                    $screenshot->captured_at = $maxTime;
                    $screenshot->save();
                    $fixedScreenshots++;
                }
            }
        }

        $this->info("Fixed {$fixedScreenshots} screenshots.");

        // 2. Fix TimeLogs based on corrected Screenshots
        $this->info("Aligning TimeLogs to corrected Screenshots...");

        $timeLogs = TimeLog::whereNotNull('end_time')->get();

        foreach ($timeLogs as $log) {
            $logScreenshots = Screenshot::where('time_log_id', $log->id)->orderBy('captured_at')->get();

            if ($logScreenshots->isEmpty()) {
                continue;
            }

            $firstScreen = $logScreenshots->first()->captured_at;
            $lastScreen = $logScreenshots->last()->captured_at;

            // Determine new start/end
            // We give a small buffer like 1 minute before/after
            $newStart = Carbon::parse($firstScreen)->subMinutes(1);
            $newEnd = Carbon::parse($lastScreen)->addMinutes(1);
            
            // Recalculate duration
            $newDuration = $newStart->diffInMinutes($newEnd);

            // Check if update is needed
            $currentStart = Carbon::parse($log->start_time);
            $currentEnd = Carbon::parse($log->end_time);

            $startDiff = $currentStart->diffInMinutes($newStart);
            $endDiff = $currentEnd->diffInMinutes($newEnd);

            if ($startDiff > 5 || $endDiff > 5) {
                $this->warn("TimeLog {$log->id} Mismatch: DB={$currentStart}-{$currentEnd} vs Calc={$newStart}-{$newEnd}");
                
                if (!$isDryRun) {
                    $log->start_time = $newStart;
                    $log->end_time = $newEnd;
                    $log->duration = $newDuration;
                    $log->save();
                    $fixedLogs++;
                }
            }
        }

        $this->info("Fixed {$fixedLogs} TimeLogs.");
        $this->info("Done.");
    }
}
