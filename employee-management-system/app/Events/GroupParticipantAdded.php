<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GroupParticipantAdded implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $conversationId;
    public $addedUsers;

    public function __construct($conversationId, array $addedUsers)
    {
        $this->conversationId = $conversationId;
        $this->addedUsers = $addedUsers;
    }

    public function broadcastOn(): array
    {
        $channels = [
            new PrivateChannel('conversation.' . $this->conversationId),
        ];

        foreach ($this->addedUsers as $user) {
            $channels[] = new PrivateChannel('notifications.' . $user['id']);
        }

        return $channels;
    }

    public function broadcastAs()
    {
        return 'participant.added';
    }
}
