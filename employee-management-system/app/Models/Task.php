<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Task extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'project_id',
        'assigned_to',
        'created_by',
        'status',
        'sort_order',
        'priority',
        'due_date',
        'estimated_hours',
        'actual_hours',
        'notes',
        'started_at',
        'completed_at',
    ];

    protected $casts = [
        'due_date' => 'date',
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'status' => 'string',
        'priority' => 'string',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function assignedTo()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function timeLogs()
    {
        return $this->hasMany(TimeLog::class)->orderBy('start_time', 'desc');
    }
}
