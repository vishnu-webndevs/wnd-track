<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramService
{
    protected ?string $botToken;
    protected ?string $adminChatId;

    public function __construct()
    {
        $this->botToken = \App\Models\Setting::get('telegram_bot_token', env('TELEGRAM_BOT_TOKEN'));
        $this->adminChatId = env('TELEGRAM_CHAT_ID');
    }

    /**
     * Send a message to admin Telegram chat
     */
    public function sendToAdmin(string $message): bool
    {
        if ($this->adminChatId) {
            return $this->sendToChat($this->adminChatId, $message);
        }

        // Fallback: search database for admin and PM users with telegram_chat_id
        $admins = \App\Models\User::whereIn('role', ['admin', 'project_manager'])
            ->whereNotNull('telegram_chat_id')
            ->where('telegram_chat_id', '!=', '')
            ->get();

        if ($admins->isEmpty()) {
            Log::warning('Telegram admin chat ID not configured in .env and no admin users have a configured telegram_chat_id.');
            return false;
        }

        $success = false;
        foreach ($admins as $admin) {
            if ($this->sendToChat($admin->telegram_chat_id, $message)) {
                $success = true;
            }
        }

        return $success;
    }

    /**
     * Send a message to a specific Telegram chat
     */
    public function sendToChat(string $chatId, string $message): bool
    {
        if (!$this->botToken) {
            Log::warning('Telegram Bot Token not configured.');
            return false;
        }

        try {
            $response = Http::post("https://api.telegram.org/bot{$this->botToken}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $message,
                'parse_mode' => 'Markdown',
            ]);

            if ($response->successful()) {
                return true;
            }

            Log::error('Telegram API error: ' . $response->body());
            return false;
        } catch (\Exception $e) {
            Log::error('Failed to send Telegram notification to ' . $chatId . ': ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Notify admin that employee is now available (tracker started)
     */
    public function notifyEmployeeAvailable(string $employeeName, string $projectName, string $taskTitle, string $startTime): bool
    {
        $message = "employee name:- {$employeeName}\n"
            . "Stating time:- {$startTime}\n\n"
            . "Project:- {$projectName}\n\n\n"
            . "Working on this task \"{$taskTitle}\"";

        return $this->sendToAdmin($message);
    }

    /**
     * Send work log to admin Telegram
     */
    public function sendWorkLog(string $employeeName, string $projectName, string $taskTitle, string $workLog, string $type = 'start'): bool
    {
        $emoji = $type === 'start' ? '🟢' : '🔴';
        $label = $type === 'start' ? 'Start Work Log' : 'End Work Log';

        $message = "{$emoji} *{$label}*\n\n"
            . "👤 *{$employeeName}*\n"
            . "📁 Project: {$projectName}\n"
            . "📋 Task: {$taskTitle}\n"
            . "📝 Work Log:\n{$workLog}";

        return $this->sendToAdmin($message);
    }

    /**
     * Notify admin about tracker events: start, resume, pause, stop
     */
    public function notifyTrackerEvent(string $action, string $employeeName, string $projectName, string $taskTitle, string $time, ?string $workLog = null, ?string $duration = null): bool
    {
        $config = match ($action) {
            'start'  => ['emoji' => '🟢', 'label' => 'Tracker Started',  'color' => ''],
            'resume' => ['emoji' => '▶️',  'label' => 'Tracker Resumed',  'color' => ''],
            'pause'  => ['emoji' => '⏸️',  'label' => 'Tracker Paused',   'color' => ''],
            'stop'   => ['emoji' => '🔴', 'label' => 'Tracker Stopped',  'color' => ''],
            default  => ['emoji' => 'ℹ️',  'label' => 'Tracker Event',    'color' => ''],
        };

        $message = "{$config['emoji']} *{$config['label']}*\n\n"
            . "👤 *{$employeeName}*\n"
            . "📁 Project: {$projectName}\n"
            . "📋 Task: {$taskTitle}\n"
            . "⏱️ Time: {$time}";

        if ($duration) {
            $message .= "\n⏳ Duration: {$duration}";
        }

        if ($workLog) {
            $logLabel = in_array($action, ['start', 'resume']) ? 'Start Work Log' : 'End Work Log';
            $message .= "\n\n📝 *{$logLabel}:*\n{$workLog}";
        }

        return $this->sendToAdmin($message);
    }

    /**
     * Notify employee about their tracker event
     */
    public function notifyEmployeeTrackerEvent(string $chatId, string $action, string $employeeName, string $time, ?string $duration = null): bool
    {
        $config = match ($action) {
            'start'  => ['emoji' => '🟢', 'label' => 'Tracker Started',  'msg' => 'Your tracking session has started.'],
            'resume' => ['emoji' => '▶️',  'label' => 'Tracker Resumed',  'msg' => 'Your tracking session has resumed.'],
            'pause'  => ['emoji' => '⏸️',  'label' => 'Tracker Paused',   'msg' => 'Your tracking session is paused.'],
            'stop'   => ['emoji' => '🔴', 'label' => 'Tracker Stopped',  'msg' => 'Your tracking session has ended.'],
            default  => ['emoji' => 'ℹ️',  'label' => 'Tracker Event',    'msg' => 'Tracker event recorded.'],
        };

        $message = "{$config['emoji']} *{$config['label']}*\n\n"
            . "Hello *{$employeeName}*!\n"
            . "{$config['msg']}\n\n"
            . "⏱️ *Time:* {$time}";

        if ($duration) {
            $message .= "\n⏳ *Duration:* {$duration}";
        }

        $footer = match ($action) {
            'start', 'resume' => "\n\n_Have a great and productive session!_",
            'pause'           => "\n\n_Take a break, you deserve it!_",
            'stop'            => "\n\n_Thank you for your hard work!_",
            default           => '',
        };

        $message .= $footer;

        return $this->sendToChat($chatId, $message);
    }
}

