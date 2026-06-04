<?php

namespace App\Events;

use App\Models\Meeting;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MeetingEnded implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Meeting $meeting;

    public function __construct(Meeting $meeting)
    {
        $this->meeting = $meeting;
    }

    public function broadcastOn(): array
    {
        $channels = [
            new PresenceChannel('presence-meeting.' . $this->meeting->id)
        ];
        foreach ($this->meeting->participants as $participant) {
            $channels[] = new PrivateChannel('App.Models.User.' . $participant->id);
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'meeting.ended';
    }

    public function broadcastWith(): array
    {
        return [
            'meeting' => $this->meeting->load(['creator', 'participants']),
        ];
    }
}
