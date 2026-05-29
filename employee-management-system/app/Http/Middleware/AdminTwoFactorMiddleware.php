<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class AdminTwoFactorMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next)
    {
        $user = Auth::user();

        // Enforce 2FA only for admins if enabled in their settings
        if ($user && $user->role === 'admin' && $user->two_factor_enabled) {
            $verifiedKey = '2fa_verified_' . $user->id;
            if (!Cache::has($verifiedKey)) {
                return response()->json([
                    'message' => 'Two-factor security verification required to access timesheet records.',
                    'code' => '2FA_REQUIRED'
                ], 403);
            }
        }

        return $next($request);
    }
}
