<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Screenshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'project_id',
        'time_log_id',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'captured_at',
        'desktop_app_id',
        'minute_breakdown',
    ];

    protected $casts = [
        'captured_at' => 'datetime',
        'file_size' => 'integer',
        'minute_breakdown' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function timeLog()
    {
        return $this->belongsTo(TimeLog::class);
    }
}
