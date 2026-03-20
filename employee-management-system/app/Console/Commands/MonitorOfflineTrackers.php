<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\TimeLog;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MonitorOfflineTrackers extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'timelogs:monitor-offline';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Monitor active time logs that have stopped sending heartbeats and notify via Telegram';

    /**
     * Execute the console command.
     */
    public function handle()
    {
      
        
        $offlineThreshold = Carbon::now()->subMinutes(6); // 6 minutes to be safe (5 min buffer + 1 min margin)
        
        $stuckLogs = TimeLog::with('user')
            ->whereNull('end_time')
            ->where('updated_at', '<', $offlineThreshold)
            ->get();

        if ($stuckLogs->isEmpty()) {
            $this->info('No stuck trackers found.');
            return;
        }

        foreach ($stuckLogs as $log) {
            $user = $log->user;
            $lastActive = $log->updated_at->diffForHumans();
            
            $message = "⚠️ *Offline Tracker Alert*\n\n"
                . "Employee: *{$user->name}* ({$user->email})\n"
                . "Project: " . ($log->project ? $log->project->name : 'N/A') . "\n"
                . "Last Heartbeat: {$lastActive}\n"
                . "Status: Tracker is running on server but no updates received (Possible Internet Loss or Crash).";

            $this->sendTelegramNotification($message, $user->telegram_chat_id);
       
        }
    }

    private function sendTelegramNotification($message, $specificChatId = null)
    {
        $botToken = env('TELEGRAM_BOT_TOKEN');
        $adminChatId = env('TELEGRAM_CHAT_ID');

        if (!$botToken) {
            Log::warning('Telegram Bot Token not configured.');
            return;
        }

        // Send to Admin
        if ($adminChatId) {
            $this->sendToChat($botToken, $adminChatId, $message);
        }

        // Send to Employee (if specificChatId is provided)
        if ($specificChatId) {
            // Customize message for employee
            $employeeMessage = "⚠️ *Alert*\n\nYour time tracker has stopped sending updates. Please check your internet connection or reload the tracker page.";
            $this->sendToChat($botToken, $specificChatId, $employeeMessage);
        }
    }

    private function sendToChat($botToken, $chatId, $message)
    {
        try {
            Http::post("https://api.telegram.org/bot{$botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $message,
                'parse_mode' => 'Markdown',
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to send Telegram notification to ' . $chatId . ': ' . $e->getMessage());
        }
    }
}
