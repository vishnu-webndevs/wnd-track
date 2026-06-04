<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserPresence extends Model
{
    protected $table = 'user_presence';

    protected $fillable = [
        'user_id',
        'status',
        'current_project_id',
        'current_task_id',
        'tracking_started_at',
        'last_activity_at',
        'internet_connected',
        'last_seen',
    ];

    protected function casts(): array
    {
        return [
            'tracking_started_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'internet_connected' => 'boolean',
            'last_seen' => 'datetime',
        ];
    }

    /**
     * Get the user that owns the presence.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the current project the user is working on.
     */
    public function currentProject(): BelongsTo
    {
        return $this->belongsTo(Project::class, 'current_project_id');
    }

    /**
     * Get the current task the user is working on.
     */
    public function currentTask(): BelongsTo
    {
        return $this->belongsTo(Task::class, 'current_task_id');
    }
}
