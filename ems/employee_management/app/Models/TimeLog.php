<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class TimeLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'task_id',
        'project_id',
        'start_time',
        'end_time',
        'duration',
        'description',
        'is_manual',
        'desktop_app_id',
    ];
    
    // protected $guarded = ['start_time'];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'is_manual' => 'boolean',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function screenshots()
    {
        return $this->hasMany(Screenshot::class);
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }
}
