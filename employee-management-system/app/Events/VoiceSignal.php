<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class VoiceSignal implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $sessionId;
    public int $senderId;
    public array $signalData;

    /**
     * Create a new event instance.
     */
    public function __construct(string $sessionId, int $senderId, array $signalData)
    {
        $this->sessionId = $sessionId;
        $this->senderId = $senderId;
        $this->signalData = $signalData;
    }

    /**
     * Get the channels the event should broadcast on.
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('voice.' . $this->sessionId),
        ];
    }

    /**
     * The event's broadcast name.
     */
    public function broadcastAs(): string
    {
        return 'voice.signal';
    }

    /**
     * Get the data to broadcast.
     */
    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->sessionId,
            'sender_id' => $this->senderId,
            'signal' => $this->signalData,
        ];
    }
}
