<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use Carbon\Carbon;

class StopGhostTimeLogs extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'timelogs:stop-ghosts';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Stop time logs that have not received a heartbeat in the last few minutes';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        // Threshold: 3 minutes. Since heartbeat is every 1 minute.
        $threshold = Carbon::now()->subMinutes(3);

        $ghostLogs = TimeLog::whereNull('end_time')
            ->where('updated_at', '<', $threshold)
            ->get();

        $count = 0;
        foreach ($ghostLogs as $log) {
            // Set end_time to the last updated_at time (last heartbeat)
            $log->end_time = $log->updated_at;
            
            // Recalculate duration
            if ($log->start_time) {
                $log->duration = $log->start_time->diffInMinutes($log->end_time);
            }
            
            $log->save();
            $count++;
        }

        if ($count > 0) {
            $this->info("Stopped $count ghost time logs.");
        } else {
            $this->info("No ghost time logs found.");
        }
    }
}
