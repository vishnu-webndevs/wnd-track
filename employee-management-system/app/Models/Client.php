<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'address',
        'company',
        'website',
        'status',
        'notes',
    ];

    protected $casts = [
        'status' => 'string',
    ];

    public function projects()
    {
        return $this->hasMany(Project::class);
    }
}
