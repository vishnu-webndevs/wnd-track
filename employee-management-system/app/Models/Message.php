<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Message extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'body',
        'type',
        'file_path',
        'file_name',
        'file_size',
    ];

    /**
     * Get the conversation of the message.
     */
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    /**
     * Get the user who sent the message.
     */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    /**
     * Get the reads for this message.
     */
    public function reads(): HasMany
    {
        return $this->hasMany(MessageRead::class);
    }

    /**
     * Check if a message is read by a specific user.
     */
    public function isReadBy(int $userId): bool
    {
        if ($this->sender_id === $userId) {
            return true;
        }
        return $this->reads()->where('user_id', $userId)->exists();
    }
}
