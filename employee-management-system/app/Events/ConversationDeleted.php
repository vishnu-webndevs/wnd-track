<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationDeleted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $conversationId;
    public $participantIds;

    public function __construct($conversationId, array $participantIds)
    {
        $this->conversationId = $conversationId;
        $this->participantIds = $participantIds;
    }

    public function broadcastOn(): array
    {
        $channels = [];
        // Broadcast a generic event to each user's private notification channel or directly?
        // Let's use the individual user's notification channel or conversation channel?
        // If the conversation is deleted, the conversation channel might be abruptly closed.
        // It's safer to send it to the user's personal channel, which is `notifications.{id}`.
        foreach ($this->participantIds as $userId) {
            $channels[] = new PrivateChannel('notifications.' . $userId);
        }
        return $channels;
    }

    public function broadcastAs()
    {
        return 'conversation.deleted';
    }
}
