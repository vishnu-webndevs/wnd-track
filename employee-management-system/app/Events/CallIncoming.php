<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CallIncoming implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $sessionId;
    public int $callerId;
    public string $callerName;
    public int $recipientId;
    public string $type;

    /**
     * Create a new event instance.
     */
    public function __construct(string $sessionId, int $callerId, string $callerName, int $recipientId, string $type = 'voice')
    {
        $this->sessionId = $sessionId;
        $this->callerId = $callerId;
        $this->callerName = $callerName;
        $this->recipientId = $recipientId;
        $this->type = $type;
    }

    /**
     * Get the channels the event should broadcast on.
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
        return 'call.incoming';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->sessionId,
            'caller_id' => $this->callerId,
            'caller_name' => $this->callerName,
            'type' => $this->type,
        ];
    }
}
