<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class AttachSanctumTokenFromCookie
{
    public function handle(Request $request, Closure $next)
    {
        if (!$request->headers->has('Authorization')) {
            $token = $request->cookie('auth_token');
            if (is_string($token) && $token !== '') {
                $request->headers->set('Authorization', 'Bearer '.$token);
            }
        }

        return $next($request);
    }
}

