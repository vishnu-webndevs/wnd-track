<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use Carbon\Carbon;
use App\Models\User;

class ShiftTimeLogs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'fix:shift-time {user_id} {--hours=} {--date=} {--start-date=} {--end-date=} {--exclude-dates=} {--dry-run}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Shift TimeLogs and Screenshots by a specified number of hours. Use user_id="all" for all users.';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $userIdArg = $this->argument('user_id');
        $hours = (float) $this->option('hours');
        $date = $this->option('date');
        $startDate = $this->option('start-date');
        $endDate = $this->option('end-date');
        $excludeDatesStr = $this->option('exclude-dates');
        $isDryRun = $this->option('dry-run');

        if (!$hours) {
            $this->error("Please provide hours using --hours=");
            return 1;
        }

        // Determine date range
        $datesToProcess = [];
        if ($date) {
            $datesToProcess[] = $date;
        } elseif ($startDate && $endDate) {
            $start = Carbon::parse($startDate);
            $end = Carbon::parse($endDate);
            while ($start->lte($end)) {
                $datesToProcess[] = $start->toDateString();
                $start->addDay();
            }
        } else {
            $this->error("Please provide --date or both --start-date and --end-date");
            return 1;
        }

        // Exclude dates
        if ($excludeDatesStr) {
            $excludeDates = explode(',', $excludeDatesStr);
            $datesToProcess = array_diff($datesToProcess, $excludeDates);
        }

        if (empty($datesToProcess)) {
            $this->warn("No dates to process.");
            return 0;
        }

        // Determine users
        $users = [];
        if ($userIdArg === 'all') {
            $users = User::all();
        } else {
            $user = User::find($userIdArg);
            if (!$user) {
                $this->error("User not found.");
                return 1;
            }
            $users = [$user];
        }

        foreach ($users as $user) {
            $this->info("Processing User: {$user->name} ({$user->id})");
            
            foreach ($datesToProcess as $currentDate) {
                $this->processDate($user->id, $currentDate, $hours, $isDryRun);
            }
        }

        return 0;
    }

    protected function processDate($userId, $date, $hours, $isDryRun)
    {
        $this->line("  Checking Date: {$date}");

        // 1. Shift TimeLogs
        $logs = TimeLog::where('user_id', $userId)
            ->whereDate('start_time', $date)
            ->get();

        if ($logs->isEmpty()) {
            // $this->line("    No logs found.");
        } else {
            $this->info("    Found " . $logs->count() . " TimeLogs.");
            foreach ($logs as $log) {
                $oldStart = $log->start_time;
                $oldEnd = $log->end_time;
                
                $newStart = $oldStart->copy()->addMinutes($hours * 60);
                $newEnd = $oldEnd ? $oldEnd->copy()->addMinutes($hours * 60) : null;

                $this->line("    Log ID {$log->id}: {$oldStart} -> {$newStart}");

                if (!$isDryRun) {
                    $log->start_time = $newStart;
                    if ($newEnd) $log->end_time = $newEnd;
                    $log->save();
                }
            }

            // 2. Shift Screenshots
            // We look for screenshots ONLY linked to the logs we just found to avoid double shifting
            $logIds = $logs->pluck('id')->toArray();
            
            $screenshots = Screenshot::where('user_id', $userId)
                ->whereIn('time_log_id', $logIds)
                ->get();

            if ($screenshots->isNotEmpty()) {
                $this->info("    Found " . $screenshots->count() . " Screenshots.");
                
                $count = 0;
                foreach ($screenshots as $screen) {
                    $oldTime = $screen->captured_at;
                    $newTime = $oldTime->copy()->addMinutes($hours * 60);
                    
                    if ($count < 3) {
                        $this->line("    Screen ID {$screen->id}: {$oldTime} -> {$newTime}");
                    }
                    $count++;

                    if (!$isDryRun) {
                        $screen->captured_at = $newTime;
                        $screen->save();
                    }
                }
                if ($screenshots->count() > 3) {
                     $this->line("    ... and " . ($screenshots->count() - 3) . " more screenshots.");
                }
            }
        }
    }
}

