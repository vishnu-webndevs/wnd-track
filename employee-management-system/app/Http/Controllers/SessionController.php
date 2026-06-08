<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Support\Facades\Auth;

class SessionController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $user = $request->user();
        
        $tokens = $user->tokens()->orderBy('last_used_at', 'desc')->get()->map(function ($token) use ($request) {
            return [
                'id' => $token->id,
                'device_name' => $token->name,
                'ip_address' => $token->ip_address,
                'last_used_at' => $token->last_used_at,
                'created_at' => $token->created_at,
                'is_current' => $request->user()->currentAccessToken() && $request->user()->currentAccessToken()->id === $token->id
            ];
        });

        return response()->json($tokens);
    }

    public function revoke(Request $request, $id)
    {
        $user = $request->user();
        
        $token = $user->tokens()->where('id', $id)->first();
        
        if (!$token) {
            return response()->json(['message' => 'Session not found'], 404);
        }

        if ($request->user()->currentAccessToken() && $request->user()->currentAccessToken()->id === $token->id) {
            return response()->json(['message' => 'Cannot revoke current session'], 400);
        }

        $token->delete();

        return response()->json(['message' => 'Session revoked successfully']);
    }
}
