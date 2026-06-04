<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Notification extends Model
{
    protected $fillable = [
        'type',
        'category',
        'title',
        'message',
        'data',
        'sender_id',
        'icon',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
        ];
    }

    /**
     * The user who triggered this notification.
     */
    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    /**
     * Recipients of this notification (pivot).
     */
    public function recipients(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'notification_recipients')
            ->withPivot(['is_read', 'read_at'])
            ->withTimestamps();
    }

    /**
     * Notification recipient records.
     */
    public function recipientRecords(): HasMany
    {
        return $this->hasMany(NotificationRecipient::class);
    }

    /**
     * Scope: notifications for a specific user.
     */
    public function scopeForUser($query, int $userId)
    {
        return $query->whereHas('recipientRecords', function ($q) use ($userId) {
            $q->where('user_id', $userId);
        });
    }

    /**
     * Scope: unread notifications for a specific user.
     */
    public function scopeUnreadFor($query, int $userId)
    {
        return $query->whereHas('recipientRecords', function ($q) use ($userId) {
            $q->where('user_id', $userId)->where('is_read', false);
        });
    }

    /**
     * Scope: filter by category.
     */
    public function scopeByCategory($query, string $category)
    {
        return $query->where('category', $category);
    }
}
