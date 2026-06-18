<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\HasOne;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'phone',
        'department',
        'position',
        'status',
        'hire_date',
        'telegram_chat_id',
        'send_worklog_telegram',
        'two_factor_enabled',
        'two_factor_method',
        'two_factor_secret',
        'two_factor_backup_codes',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'hire_date' => 'date',
            'send_worklog_telegram' => 'boolean',
            'two_factor_enabled' => 'boolean',
            'two_factor_backup_codes' => 'array',
        ];
    }

    public function projects()
    {
        return $this->hasMany(Project::class, 'manager_id');
    }

    public function assignedProjects()
    {
        return $this->belongsToMany(Project::class, 'project_user')->withTimestamps();
    }

    public function assignedTasks()
    {
        return $this->belongsToMany(Task::class, 'task_user')->withTimestamps();
    }

    public function createdTasks()
    {
        return $this->hasMany(Task::class, 'created_by');
    }

    public function timeLogs()
    {
        return $this->hasMany(TimeLog::class)->orderBy('start_time', 'desc');
    }

    public function screenshots()
    {
        return $this->hasMany(Screenshot::class);
    }

    public function activityLogs()
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function presence(): HasOne
    {
        return $this->hasOne(UserPresence::class);
    }

    public function meetings()
    {
        return $this->belongsToMany(Meeting::class, 'meeting_participants')
            ->using(MeetingParticipant::class)
            ->withPivot(['role', 'status', 'joined_at', 'left_at'])
            ->withTimestamps();
    }

    public function isAdmin()
    {
        return $this->role === 'admin';
    }

    public function isEmployee()
    {
        return $this->role === 'employee';
    }

    /**
     * Accessor to automatically decrypt telegram_chat_id.
     */
    public function getTelegramChatIdAttribute($value)
    {
        if (empty($value)) {
            return $value;
        }

        try {
            return \Illuminate\Support\Facades\Crypt::decryptString($value);
        } catch (\Illuminate\Contracts\Encryption\DecryptException $e) {
            // Fallback for existing plaintext values
            return $value;
        }
    }

    /**
     * Mutator to automatically encrypt telegram_chat_id.
     */
    public function setTelegramChatIdAttribute($value)
    {
        $this->attributes['telegram_chat_id'] = !empty($value) 
            ? \Illuminate\Support\Facades\Crypt::encryptString($value) 
            : $value;
    }
}
