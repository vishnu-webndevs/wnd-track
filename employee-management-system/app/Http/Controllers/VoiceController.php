<?php

namespace App\Http\Controllers;

use App\Events\CallIncoming;
use App\Events\VoiceSignal;
use App\Events\CallEnded;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Log;

class VoiceController extends Controller
{
    /**
     * Initiate a WebRTC call.
     */
    public function initiate(Request $request): JsonResponse
    {
        $request->validate([
            'recipient_id' => 'required|exists:users,id',
            'type' => 'nullable|in:voice,video',
        ]);

        $caller = $request->user();
        $recipientId = (int) $request->input('recipient_id');
        $type = $request->input('type', 'voice');

        if ($caller->id === $recipientId) {
            return response()->json([
                'success' => false,
                'message' => 'You cannot call yourself.',
            ], 422);
        }

        $sessionId = $request->input('session_id') ?: Str::uuid()->toString();

        try {
            broadcast(new CallIncoming($sessionId, $caller->id, $caller->name, $recipientId, $type))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast incoming call: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'session_id' => $sessionId,
            'caller_id' => $caller->id,
            'recipient_id' => $recipientId,
        ]);
    }

    /**
     * Relay WebRTC signaling data (SDP offer/answer, ICE candidates).
     */
    public function signal(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string',
            'signal' => 'required|array',
        ]);

        $sessionId = $request->input('session_id');
        $signalData = $request->input('signal');
        $senderId = $request->user()->id;

        try {
            broadcast(new VoiceSignal($sessionId, $senderId, $signalData))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast voice signal: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
        ]);
    }

    /**
     * Terminate call session.
     */
    public function end(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => 'required|string',
        ]);

        $sessionId = $request->input('session_id');

        try {
            broadcast(new CallEnded($sessionId))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast call ended: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Call ended.',
        ]);
    }

    /**
     * Get ICE servers configurations (STUN/TURN).
     */
    public function iceServers(): JsonResponse
    {
        $iceServers = [
            [
                'urls' => [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302',
                    'stun:stun3.l.google.com:19302',
                    'stun:stun4.l.google.com:19302',
                ]
            ]
        ];

        $meteredDomain = env('METERED_DOMAIN');
        $meteredSecretKey = env('METERED_SECRET_KEY');
        $meteredApiKey = env('METERED_API_KEY');

        if ($meteredDomain) {
            try {
                $cacheKey = 'metered:turn:iceServers:' . $meteredDomain;
                $cached = Cache::get($cacheKey);
                if (is_array($cached) && count($cached) > 0) {
                    $iceServers = array_merge($iceServers, $cached);
                } else {
                    $fetchIceServers = function (string $apiKey) use ($meteredDomain): ?array {
                        $response = Http::timeout(5)->get("https://{$meteredDomain}/api/v1/turn/credentials", [
                            'apiKey' => $apiKey,
                        ]);

                        if (!$response->successful()) {
                            return null;
                        }

                        $data = $response->json();
                        return is_array($data) ? $data : null;
                    };

                    $meteredServers = null;

                    if (is_string($meteredApiKey) && $meteredApiKey !== '') {
                        $meteredServers = $fetchIceServers($meteredApiKey);
                    }

                    if (!$meteredServers && is_string($meteredSecretKey) && $meteredSecretKey !== '') {
                        $meteredServers = $fetchIceServers($meteredSecretKey);
                    }

                    if (!$meteredServers && is_string($meteredSecretKey) && $meteredSecretKey !== '') {
                        $create = Http::timeout(5)->post(
                            "https://{$meteredDomain}/api/v1/turn/credential?secretKey=" . urlencode($meteredSecretKey),
                            [
                                'expiryInSeconds' => 3600,
                                'label' => 'wnd-tracker',
                            ]
                        );

                        if ($create->successful()) {
                            $created = $create->json();
                            $apiKey = is_array($created) ? ($created['apiKey'] ?? null) : null;
                            if (is_string($apiKey) && $apiKey !== '') {
                                $meteredServers = $fetchIceServers($apiKey);
                            }
                        }
                    }

                    if (is_array($meteredServers) && count($meteredServers) > 0) {
                        Cache::put($cacheKey, $meteredServers, now()->addMinutes(50));
                        $iceServers = array_merge($iceServers, $meteredServers);
                    }
                }
            } catch (\Exception $e) {
                Log::error('Metered TURN fetch failed: ' . $e->getMessage());
            }
        }

        $turnUrl = env('TURN_URL');
        $turnUser = env('TURN_USERNAME');
        $turnPass = env('TURN_PASSWORD');
        if ($turnUrl && $turnUser && $turnPass) {
             $normalizeTurnUrl = function (string $url): ?string {
                 $u = trim($url);
                 if ($u === '') {
                     return null;
                 }

                 if (preg_match('/^(stun:|turn:|turns:)/i', $u)) {
                     return $u;
                 }

                 if (preg_match('/^[a-z0-9.-]+:\d+(\\?.*)?$/i', $u)) {
                     return 'turn:' . $u;
                 }

                 return null;
             };

             $rawUrls = str_contains($turnUrl, ',') ? array_map('trim', explode(',', $turnUrl)) : [$turnUrl];
             $urls = array_values(array_filter(array_map($normalizeTurnUrl, $rawUrls)));
             if (count($urls) === 0) {
                 $urls = [];
             }

             $iceServers[] = [
                 'urls' => count($urls) === 1 ? $urls[0] : $urls,
                 'username' => $turnUser,
                 'credential' => $turnPass
             ];
        }

        return response()->json([
            'success' => true,
            'iceServers' => $iceServers,
        ]);
    }
}
