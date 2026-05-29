<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = ['key', 'value'];

    /**
     * Get a setting value by key with optional default fallback.
     */
    public static function get(string $key, $default = null)
    {
        $setting = self::where('key', $key)->first();
        if ($setting) {
            $value = $setting->value;
            if ($key === 'telegram_bot_token' && !empty($value)) {
                try {
                    return \Illuminate\Support\Facades\Crypt::decryptString($value);
                } catch (\Illuminate\Contracts\Encryption\DecryptException $e) {
                    // Fallback for existing plaintext value
                    return $value;
                }
            }
            return $value;
        }
        return $default;
    }

    /**
     * Set a setting value by key.
     */
    public static function set(string $key, ?string $value): self
    {
        if ($key === 'telegram_bot_token' && !empty($value)) {
            $value = \Illuminate\Support\Facades\Crypt::encryptString($value);
        }

        return self::updateOrCreate(
            ['key' => $key],
            ['value' => $value]
        );
    }
}
