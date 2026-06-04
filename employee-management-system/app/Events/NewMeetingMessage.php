<?php

namespace App\Events;

use App\Models\MeetingMessage;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewMeetingMessage implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public MeetingMessage $meetingMessage;

    public function __construct(MeetingMessage $meetingMessage)
    {
        $this->meetingMessage = $meetingMessage;
    }

    public function broadcastOn(): array
    {
        return [
            new PresenceChannel('presence-meeting.' . $this->meetingMessage->meeting_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'new.meeting.message';
    }

    public function broadcastWith(): array
    {
        $this->meetingMessage->load('user:id,name');

        return [
            'message' => [
                'id' => $this->meetingMessage->id,
                'meeting_id' => $this->meetingMessage->meeting_id,
                'user_id' => $this->meetingMessage->user_id,
                'user_name' => $this->meetingMessage->user->name,
                'message' => $this->meetingMessage->message,
                'created_at' => $this->meetingMessage->created_at->toIso8601String(),
            ],
        ];
    }
}
