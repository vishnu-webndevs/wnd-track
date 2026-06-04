<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MeetingParticipant extends Pivot
{
    protected $table = 'meeting_participants';

    protected $fillable = [
        'meeting_id',
        'user_id',
        'role',
        'status',
        'joined_at',
        'left_at',
    ];

    protected $casts = [
        'joined_at' => 'datetime',
        'left_at' => 'datetime',
    ];

    public function meeting(): BelongsTo
    {
        return $this->belongsTo(Meeting::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
