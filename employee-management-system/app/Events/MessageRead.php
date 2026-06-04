<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageRead implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public int $conversationId;
    public int $userId;
    public string $readAt;

    /**
     * Create a new event instance.
     */
    public function __construct(int $conversationId, int $userId, string $readAt)
    {
        $this->conversationId = $conversationId;
        $this->userId = $userId;
        $this->readAt = $readAt;
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('conversation.' . $this->conversationId),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'message.read';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return [
            'conversation_id' => $this->conversationId,
            'user_id' => $this->userId,
            'read_at' => $this->readAt,
        ];
    }
}
