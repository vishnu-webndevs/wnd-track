<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use App\Models\Screenshot;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class MonitorLowActivity extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'timelogs:monitor-activity';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Monitor active time logs for zero activity and notify via Telegram';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $botToken = env('TELEGRAM_BOT_TOKEN');
        if (!$botToken) {
            $this->error('Telegram Bot Token not configured.');
            return;
        }

        // 1. Find users with active time logs updated in the last 15 minutes
        $activeLogs = TimeLog::with('user')
            ->whereNull('end_time')
            ->where('updated_at', '>', Carbon::now()->subMinutes(15))
            ->get();

        foreach ($activeLogs as $log) {
            $user = $log->user;
            
            // Only proceed if employee has a Telegram Chat ID
            if (!$user || !$user->telegram_chat_id) {
                continue;
            }

            // 2. Get the latest screenshot for this time log
            $latestScreenshot = Screenshot::where('time_log_id', $log->id)
                ->latest('captured_at')
                ->first();

            if (!$latestScreenshot || !$latestScreenshot->minute_breakdown) {
                continue;
            }

            // 3. Prevent duplicate alerts for the same screenshot
            $cacheKey = "activity_alert_{$user->id}_{$latestScreenshot->id}";
            if (Cache::has($cacheKey)) {
                continue;
            }

            // 4. Analyze activity in the minute_breakdown (usually covers ~10 minutes)
            $breakdown = $latestScreenshot->minute_breakdown;
            if (!is_array($breakdown)) {
                continue;
            }

            $totalActivity = 0;
            $minuteEntries = count($breakdown);

            // Only alert if we have enough data (at least 5 minutes of logs in the breakdown)
            if ($minuteEntries < 5) {
                continue;
            }

            foreach ($breakdown as $minute) {
                $totalActivity += ($minute['keyboard_clicks'] ?? 0);
                $totalActivity += ($minute['mouse_clicks'] ?? 0);
                $totalActivity += ($minute['mouse_scrolls'] ?? 0);
                $totalActivity += ($minute['mouse_movements'] ?? 0);
            }

            // 5. If total activity is exactly 0, send the Telegram message
            if ($totalActivity === 0) {
                $message = "⚠️ Alert\nPichle 10 minute se aapki koi activity detect nahi hui hai. Kripya ensure karein ki aap kaam kar rahe hain ya tracker page active rakhein.";
                
                $this->sendToChat($botToken, $user->telegram_chat_id, $message);
                
                // Cache for 1 hour to avoid spamming for the same log period
                Cache::put($cacheKey, true, 3600);
                $this->info("Zero activity alert sent to {$user->name} (Chat ID: {$user->telegram_chat_id})");
            }
        }
    }

    /**
     * Send message to Telegram chat
     */
    private function sendToChat($botToken, $chatId, $message)
    {
        try {
            Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $message,
                // Using basic text as requested, no Markdown needed for this specific message
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to send activity alert to Telegram ' . $chatId . ': ' . $e->getMessage());
        }
    }
}
