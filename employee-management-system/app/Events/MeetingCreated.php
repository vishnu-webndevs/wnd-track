<?php

namespace App\Events;

use App\Models\Meeting;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MeetingCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Meeting $meeting;

    public function __construct(Meeting $meeting)
    {
        $this->meeting = $meeting;
    }

    public function broadcastOn(): array
    {
        $channels = [];
        // Broadcast to all participants (even host, so their local lists sync)
        foreach ($this->meeting->participants as $participant) {
            $channels[] = new PrivateChannel('App.Models.User.' . $participant->id);
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'meeting.created';
    }

    public function broadcastWith(): array
    {
        return [
            'meeting' => $this->meeting->load(['creator', 'participants']),
        ];
    }
}
