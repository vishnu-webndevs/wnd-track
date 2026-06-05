<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GroupParticipantRemoved implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $conversationId;
    public $removedUserId;

    public function __construct($conversationId, $removedUserId)
    {
        $this->conversationId = $conversationId;
        $this->removedUserId = $removedUserId;
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('conversation.' . $this->conversationId),
            new PrivateChannel('notifications.' . $this->removedUserId), // So the kicked user knows
        ];
    }

    public function broadcastAs()
    {
        return 'participant.removed';
    }
}
