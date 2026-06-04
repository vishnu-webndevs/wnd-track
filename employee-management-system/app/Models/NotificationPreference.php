<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationPreference extends Model
{
    protected $fillable = [
        'user_id',
        'category',
        'in_app',
        'desktop',
        'telegram',
        'email',
    ];

    protected function casts(): array
    {
        return [
            'in_app' => 'boolean',
            'desktop' => 'boolean',
            'telegram' => 'boolean',
            'email' => 'boolean',
        ];
    }

    /**
     * The user this preference belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the default preferences for all categories.
     */
    public static function getDefaults(): array
    {
        return [
            'tracking'      => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => false],
            'user'          => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => false],
            'network'       => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => false],
            'work'          => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => true],
            'meeting'       => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => true],
            'communication' => ['in_app' => true, 'desktop' => true, 'telegram' => false, 'email' => false],
        ];
    }

    /**
     * Get preferences for a user, merging with defaults.
     */
    public static function getForUser(int $userId): array
    {
        $saved = static::where('user_id', $userId)->get()->keyBy('category');
        $defaults = static::getDefaults();
        $result = [];

        foreach ($defaults as $category => $defaultPrefs) {
            if ($saved->has($category)) {
                $pref = $saved->get($category);
                $result[$category] = [
                    'in_app'   => $pref->in_app,
                    'desktop'  => $pref->desktop,
                    'telegram' => $pref->telegram,
                    'email'    => $pref->email,
                ];
            } else {
                $result[$category] = $defaultPrefs;
            }
        }

        return $result;
    }
}
