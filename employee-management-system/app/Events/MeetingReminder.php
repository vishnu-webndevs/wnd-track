<?php

namespace App\Events;

use App\Models\Meeting;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MeetingReminder implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public Meeting $meeting;
    public string $timeString; // e.g., "in 5 minutes", "in 15 minutes", "now"

    public function __construct(Meeting $meeting, string $timeString)
    {
        $this->meeting = $meeting;
        $this->timeString = $timeString;
    }

    public function broadcastOn(): array
    {
        $channels = [];
        foreach ($this->meeting->participants as $participant) {
            $channels[] = new PrivateChannel('App.Models.User.' . $participant->id);
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'meeting.reminder';
    }

    public function broadcastWith(): array
    {
        return [
            'meeting' => $this->meeting->load(['creator']),
            'time_string' => $this->timeString,
        ];
    }
}
