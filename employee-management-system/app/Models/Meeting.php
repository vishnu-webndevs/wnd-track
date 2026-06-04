<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Meeting extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'type',
        'status',
        'created_by',
        'scheduled_at',
        'duration_minutes',
        'started_at',
        'ended_at',
        'meeting_link',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'meeting_participants')
            ->using(MeetingParticipant::class)
            ->withPivot(['role', 'status', 'joined_at', 'left_at'])
            ->withTimestamps();
    }

    public function participantPivot(): HasMany
    {
        return $this->hasMany(MeetingParticipant::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(MeetingMessage::class);
    }

    // Scopes
    public function scopeUpcoming($query)
    {
        return $query->where('status', 'scheduled');
    }

    public function scopeLive($query)
    {
        return $query->where('status', 'live');
    }

    public function scopeCompleted($query)
    {
        return $query->where('status', 'completed');
    }
}
