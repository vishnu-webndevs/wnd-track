<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/track_app', function () {
    $candidates = [
        'track_app/Tracker Webndevs.exe',
        'track_app/TrackerWebndevs.exe',
    ];

    $found = null;
    foreach ($candidates as $candidate) {
        if (Storage::disk('public')->exists($candidate)) {
            $found = $candidate;
            break;
        }
    }

    if (!$found) {
        abort(404);
    }

    $path = Storage::disk('public')->path($found);
    return response()->download($path, 'TrackerWebndevs.exe');
});

Route::get('/admin', function () {
    return view('admin');
});

Route::get('/dashboard', function () {
    return view('admin');
});
