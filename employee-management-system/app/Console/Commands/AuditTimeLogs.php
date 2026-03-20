<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use App\Models\User;

class AuditTimeLogs extends Command
{
    protected $signature = 'audit:timelogs {user_id}';
    protected $description = 'Compare TimeLogs against Screenshots to verify data integrity';

    public function handle()
    {
        $userId = $this->argument('user_id');
        $user = User::find($userId);

        if (!$user) {
            $this->error("User not found.");
            return;
        }

        $this->info("Auditing TimeLogs for user: {$user->name} ({$user->id})");
        
        $logs = TimeLog::where('user_id', $userId)
            ->whereNotNull('end_time')
            ->orderBy('start_time')
            ->get();

        $headers = ['Log ID', 'Log Start', 'Log End', 'Duration (min)', 'First Screen', 'Last Screen', 'Diff Start (min)', 'Diff End (min)', 'Status'];
        $rows = [];

        foreach ($logs as $log) {
            // Find screenshots linked to this log OR within the time range
            $screenshots = Screenshot::where('user_id', $userId)
                ->whereBetween('captured_at', [$log->start_time, $log->end_time])
                ->orderBy('captured_at')
                ->get();

            if ($screenshots->isEmpty()) {
                // Try finding screenshots linked by time_log_id specifically if strict range failed
                // (Though usually range is what matters for "truth")
                 $screenshots = Screenshot::where('time_log_id', $log->id)
                    ->orderBy('captured_at')
                    ->get();
            }

            $status = 'OK';
            $firstScreen = $screenshots->first() ? $screenshots->first()->captured_at : null;
            $lastScreen = $screenshots->last() ? $screenshots->last()->captured_at : null;
            
            $diffStart = $firstScreen ? $log->start_time->diffInMinutes($firstScreen, false) : 0; // Positive if log starts before screen
            $diffEnd = $lastScreen ? $lastScreen->diffInMinutes($log->end_time, false) : 0; // Positive if log ends after screen

            if ($screenshots->isEmpty()) {
                $status = 'NO EVIDENCE';
            } elseif (abs($diffStart) > 10 || abs($diffEnd) > 10) {
                $status = 'MISMATCH';
            }

            // Highlight suspicious truncated logs
            if ($log->duration == 1 && $screenshots->count() > 0) {
                $status = 'BAD TRUNCATE';
            }

            if ($status != 'OK') {
                 $rows[] = [
                    $log->id,
                    $log->start_time->toDateTimeString(),
                    $log->end_time->toDateTimeString(),
                    number_format($log->duration, 1),
                    $firstScreen ? $firstScreen->toDateTimeString() : 'N/A',
                    $lastScreen ? $lastScreen->toDateTimeString() : 'N/A',
                    number_format($diffStart, 1),
                    number_format($diffEnd, 1),
                    $status
                ];
            }
        }

        $this->table($headers, $rows);
        
        $this->info("Audit Complete. Showing only problematic logs.");
    }
}
