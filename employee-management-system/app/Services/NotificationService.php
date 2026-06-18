<?php

namespace App\Services;

use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\NotificationRecipient;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class NotificationService
{
    protected TelegramService $telegramService;

    public function __construct(TelegramService $telegramService)
    {
        $this->telegramService = $telegramService;
    }

    /**
     * Create and dispatch a notification to specified recipients.
     */
    public function send(
        string $type,
        string $category,
        string $title,
        string $message,
        array $data = [],
        ?int $senderId = null,
        array $recipientIds = [],
        ?string $icon = null
    ): Notification {
        // 1. Create notification record
        $notification = Notification::create([
            'type' => $type,
            'category' => $category,
            'title' => $title,
            'message' => $message,
            'data' => $data,
            'sender_id' => $senderId,
            'icon' => $icon,
        ]);

        // Load sender for broadcast payload
        if ($senderId) {
            $notification->load('sender');
        }

        // 2. Create recipient records and broadcast
        foreach ($recipientIds as $recipientId) {
            NotificationRecipient::create([
                'notification_id' => $notification->id,
                'user_id' => $recipientId,
            ]);

            // Get user preferences for this category
            $prefs = $this->getUserPreferences($recipientId, $category);
            $shouldBroadcast = $prefs['in_app'] || $prefs['desktop'];

            // 3. Broadcast to WebSocket (in-app + desktop notification)
            if ($shouldBroadcast) {
                try {
                    broadcast(new NotificationCreated($notification, $recipientId));
                } catch (\Exception $e) {
                    Log::warning('Failed to broadcast notification: ' . $e->getMessage());
                }
            }

            // 4. Send Telegram if enabled
            if ($prefs['telegram']) {
                $this->sendTelegramNotification($notification, $recipientId);
            }

            // 5. Queue email if enabled (for work logs, meetings, daily summaries)
            // Email sending will be handled per-type in future phases
        }

        return $notification;
    }

    /**
     * Send notification to all admin users.
     */
    public function sendToAdmins(
        string $type,
        string $category,
        string $title,
        string $message,
        array $data = [],
        ?int $senderId = null,
        ?string $icon = null
    ): Notification {
        $query = User::where('role', 'admin')->where('status', 'active');
        if ($senderId) {
            $query->where('id', '!=', $senderId);
        }
        $adminIds = $query->pluck('id')->toArray();

        return $this->send($type, $category, $title, $message, $data, $senderId, $adminIds, $icon);
    }

    /**
     * Send notification to all active users.
     */
    public function sendToAll(
        string $type,
        string $category,
        string $title,
        string $message,
        array $data = [],
        ?int $senderId = null,
        ?string $icon = null
    ): Notification {
        $query = User::where('status', 'active');
        if ($senderId) {
            $query->where('id', '!=', $senderId);
        }
        $userIds = $query->pluck('id')->toArray();

        return $this->send($type, $category, $title, $message, $data, $senderId, $userIds, $icon);
    }

    /**
     * Send notification to a single user.
     */
    public function sendToUser(
        int $userId,
        string $type,
        string $category,
        string $title,
        string $message,
        array $data = [],
        ?int $senderId = null,
        ?string $icon = null
    ): Notification {
        return $this->send($type, $category, $title, $message, $data, $senderId, [$userId], $icon);
    }

    /**
     * Get user preferences for a specific notification category.
     */
    protected function getUserPreferences(int $userId, string $category): array
    {
        $prefs = NotificationPreference::where('user_id', $userId)
            ->where('category', $category)
            ->first();

        if ($prefs) {
            return [
                'in_app' => $prefs->in_app,
                'desktop' => $prefs->desktop,
                'telegram' => $prefs->telegram,
                'email' => $prefs->email,
            ];
        }

        // Return defaults
        $defaults = NotificationPreference::getDefaults();
        return $defaults[$category] ?? [
            'in_app' => true,
            'desktop' => true,
            'telegram' => false,
            'email' => false,
        ];
    }

    /**
     * Send Telegram notification to a user.
     */
    protected function sendTelegramNotification(Notification $notification, int $userId): void
    {
        try {
            $user = User::find($userId);
            if (!$user || empty($user->telegram_chat_id)) {
                return;
            }

            $emoji = match ($notification->category) {
                'tracking' => '⏱️',
                'user' => '👤',
                'meeting' => '📅',
                'communication' => '💬',
                'work' => '📋',
                'network' => '🌐',
                default => '🔔',
            };

            $telegramMessage = "{$emoji} *{$notification->title}*\n\n{$notification->message}";

            $this->telegramService->sendToChat($user->telegram_chat_id, $telegramMessage);
        } catch (\Exception $e) {
            Log::warning("Failed to send Telegram notification to user {$userId}: " . $e->getMessage());
        }
    }
}
