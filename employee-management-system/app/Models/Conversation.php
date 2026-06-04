<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Conversation extends Model
{
    protected $fillable = [
        'type',
        'name',
        'created_by',
        'last_message_at',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
        ];
    }

    /**
     * Scope to only include conversations the user is a participant of.
     */
    public function scopeForUser($query, int $userId)
    {
        return $query->whereHas('participants', function ($q) use ($userId) {
            $q->where('user_id', $userId);
        });
    }

    /**
     * Get the participants for the conversation.
     */
    public function participants(): HasMany
    {
        return $this->hasMany(ConversationParticipant::class);
    }

    /**
     * Get the users participating in the conversation.
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_participants');
    }

    /**
     * Get the messages in the conversation.
     */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    /**
     * Get the latest message of the conversation.
     */
    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany();
    }

    /**
     * Get the user who created the conversation.
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get unread message count for a specific user in this conversation.
     */
    public function getUnreadCountFor(int $userId): int
    {
        $participant = $this->participants()->where('user_id', $userId)->first();
        if (!$participant) {
            return 0;
        }

        $lastReadAt = $participant->last_read_at;

        $query = $this->messages()->where('sender_id', '!=', $userId);
        if ($lastReadAt) {
            $query->where('created_at', '>', $lastReadAt);
        }

        return $query->count();
    }

    /**
     * Check if a user is a participant of this conversation.
     */
    public function isParticipant(int $userId): bool
    {
        return $this->participants()->where('user_id', $userId)->exists();
    }
}
