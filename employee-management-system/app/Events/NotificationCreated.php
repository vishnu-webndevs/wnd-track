<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public array $notificationData;
    public int $recipientId;

    /**
     * Create a new event instance.
     */
    public function __construct(Notification $notification, int $recipientId)
    {
        $this->recipientId = $recipientId;
        $this->notificationData = [
            'id' => $notification->id,
            'type' => $notification->type,
            'category' => $notification->category,
            'title' => $notification->title,
            'message' => $notification->message,
            'data' => $notification->data,
            'icon' => $notification->icon,
            'sender' => $notification->sender ? [
                'id' => $notification->sender->id,
                'name' => $notification->sender->name,
            ] : null,
            'created_at' => $notification->created_at->toISOString(),
        ];
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return array<int, \Illuminate\Broadcasting\Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('notifications.' . $this->recipientId),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    /**
     * Get the data to broadcast.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return $this->notificationData;
    }
}
