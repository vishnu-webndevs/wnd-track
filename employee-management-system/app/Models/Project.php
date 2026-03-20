<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'client_id',
        'manager_id',
        'status',
        'start_date',
        'end_date',
        'budget',
        'priority',
        'notes',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'budget' => 'decimal:2',
        'status' => 'string',
        'priority' => 'string',
    ];

    public function client()
    {
        return $this->belongsTo(Client::class);
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function tasks()
    {
        return $this->hasMany(Task::class);
    }

    public function timeLogs()
    {
        return $this->hasMany(TimeLog::class);
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
