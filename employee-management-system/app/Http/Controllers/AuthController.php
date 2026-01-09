<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    private const AUTH_COOKIE_NAME = 'auth_token';

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        try {
            $days = 7;
            $date = now()->subDays($days);
            DB::table('personal_access_tokens')
                ->where(function ($query) use ($date) {
                    $query->where('last_used_at', '<', $date)
                        ->orWhere(function ($q) use ($date) {
                            $q->whereNull('last_used_at')
                                ->where('created_at', '<', $date);
                        });
                })
                ->delete();
        } catch (\Exception $e) {
        }

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['Your account is inactive. Please contact administrator.'],
            ]);
        }

        $token = $user->createToken('auth-token')->plainTextToken;

        Auth::login($user);

        return response()
            ->json([
            'user' => $user,
            'role' => $user->role,
        ])
            ->cookie(
                self::AUTH_COOKIE_NAME,
                $token,
                60 * 24 * 7,
                '/',
                null,
                !app()->environment('local'),
                true,
                false,
                'Strict'
            );
    }

    public function logout(Request $request)
    {
        $token = $request->cookie(self::AUTH_COOKIE_NAME);
        if (is_string($token) && $token !== '') {
            $pat = PersonalAccessToken::findToken($token);
            if ($pat) {
                $pat->delete();
            }
        }

        try {
            if ($request->user() && $request->user()->currentAccessToken()) {
                $request->user()->currentAccessToken()->delete();
            }
        } catch (\Throwable $e) {
        }

        try {
            Auth::logout();
        } catch (\Throwable $e) {
        }

        return response()
            ->json([
            'message' => 'Logged out successfully'
        ])
            ->cookie(self::AUTH_COOKIE_NAME, '', -1, '/');
    }

    public function user(Request $request)
    {
        return response()->json([
            'user' => $request->user()
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'in:admin,employee',
            'phone' => 'nullable|string|max:20',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'hire_date' => 'nullable|date',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role ?? 'employee',
            'phone' => $request->phone,
            'department' => $request->department,
            'position' => $request->position,
            'hire_date' => $request->hire_date,
        ]);

        $token = $user->createToken('auth-token')->plainTextToken;

        Auth::login($user);

        return response()
            ->json([
            'user' => $user,
            'role' => $user->role,
        ], 201)
            ->cookie(
                self::AUTH_COOKIE_NAME,
                $token,
                60 * 24 * 7,
                '/',
                null,
                !app()->environment('local'),
                true,
                false,
                'Strict'
            );
    }
}
