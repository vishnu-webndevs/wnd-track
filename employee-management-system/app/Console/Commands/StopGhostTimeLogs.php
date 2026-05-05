<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
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
        $threshold = Carbon::now()->subMinutes(10);

        $ghostLogs = TimeLog::whereNull('end_time')
            ->where('updated_at', '<', $threshold)
            ->get();

        $count = 0;
        foreach ($ghostLogs as $log) {
            // Determine the best end_time by checking:
            // 1. The last heartbeat (updated_at)
            // 2. The latest screenshot's captured_at for this time log
            // Use whichever is MORE RECENT to avoid losing tracked work
            // (e.g., if app reloaded and heartbeats stopped but screenshots were already uploaded)
            $bestEndTime = $log->updated_at;

            $latestScreenshot = Screenshot::where('time_log_id', $log->id)
                ->latest('captured_at')
                ->first();

            if ($latestScreenshot && $latestScreenshot->captured_at) {
                $screenshotTime = Carbon::parse($latestScreenshot->captured_at);
                if ($screenshotTime->gt($bestEndTime)) {
                    $bestEndTime = $screenshotTime;
                }
            }

            $log->end_time = $bestEndTime;
            
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
