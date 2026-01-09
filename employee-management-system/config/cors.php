<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => (function () {
        $raw = array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', '*')));
        $origins = array_values(array_filter($raw, fn ($v) => $v !== ''));
        
        $defaults = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8000',
            'http://127.0.0.1:8000',
        ];

        if ($frontend = env('FRONTEND_URL')) {
            $defaults[] = $frontend;
        }

        if (count($origins) === 1 && $origins[0] === '*') {
            return $defaults;
        }
        return $origins;
    })(),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
