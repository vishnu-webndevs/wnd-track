<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Signal extends Model
{
    protected $fillable = [
        'user_id',
        'from_admin',
        'type',
        'sdp',
        'candidate',
        'is_read',
    ];
}
