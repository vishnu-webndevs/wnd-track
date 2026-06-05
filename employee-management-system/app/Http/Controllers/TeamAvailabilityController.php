<?php

namespace App\Http\Controllers;

use App\Models\Screenshot;
use App\Models\TimeLog;
use App\Models\User;
use App\Models\Setting;
use App\Services\PresenceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class TeamAvailabilityController extends Controller
{
    protected PresenceService $presenceService;

    public function __construct(PresenceService $presenceService)
    {
        $this->presenceService = $presenceService;
    }

    /**
     * Get team availability list with optional filters.
     */
    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['status', 'project_id', 'department', 'search']);
        $teamPresence = $this->presenceService->getTeamStatus($filters);

        $offlineSecondsRaw = Setting::get('presence_offline_seconds', env('PRESENCE_OFFLINE_SECONDS', 180));
        $offlineSeconds = max(30, (int) $offlineSecondsRaw);
        $now = now();
        $teamPresence = $teamPresence->map(function ($p) use ($offlineSeconds, $now) {
            $lastSeen = null;
            try {
                $lastSeen = $p->last_seen ? Carbon::parse($p->last_seen) : null;
            } catch (\Throwable $e) {
            }

            if (!$lastSeen || $now->diffInSeconds($lastSeen) > $offlineSeconds) {
                $p->status = 'offline';
                $p->internet_connected = false;
            }

            return $p;
        });

        $viewer = $request->user();
        if ($viewer && $viewer->role === 'admin') {
            $minStreakRaw = Setting::get('idle_no_movement_minutes', env('IDLE_NO_MOVEMENT_MINUTES', 5));
            $minStreak = max(1, (int) $minStreakRaw);

            $start = now()->startOfDay();
            $end = now()->endOfDay();

            $userIds = $teamPresence->pluck('user_id')->unique()->values()->all();
            $idleTotals = [];
            $idleStreakCounts = [];

            if (!empty($userIds)) {
                $shots = Screenshot::whereIn('user_id', $userIds)
                    ->whereNotNull('minute_breakdown')
                    ->whereBetween('captured_at', [$start, $end])
                    ->orderBy('captured_at', 'asc')
                    ->get(['user_id', 'minute_breakdown']);

                $perUserMinuteActivity = [];
                foreach ($shots as $shot) {
                    $uid = (int) $shot->user_id;
                    $breakdown = $shot->minute_breakdown;
                    if (!is_array($breakdown)) continue;

                    foreach ($breakdown as $entry) {
                        if (!is_array($entry) || !isset($entry['timestamp'])) continue;
                        try {
                            $ts = Carbon::parse((string) $entry['timestamp'])->setTimezone($start->getTimezone());
                        } catch (\Throwable $e) {
                            continue;
                        }
                        if ($ts->lt($start) || $ts->gt($end)) continue;

                        $key = $ts->format('Y-m-d H:i');
                        $a = 0;
                        $a += (int) ($entry['keyboard_clicks'] ?? 0);
                        $a += (int) ($entry['mouse_clicks'] ?? 0);
                        $a += (int) ($entry['mouse_scrolls'] ?? 0);
                        $a += (int) ($entry['mouse_movements'] ?? 0);
                        if (isset($entry['total_activity'])) {
                            $a = max($a, (int) $entry['total_activity']);
                        }

                        $existing = $perUserMinuteActivity[$uid][$key] ?? null;
                        if ($existing === null || $a > $existing) {
                            $perUserMinuteActivity[$uid][$key] = $a;
                        }
                    }
                }

                $timeLogs = \App\Models\TimeLog::whereIn('user_id', $userIds)
                    ->where('start_time', '>=', $start)
                    ->get();

                foreach ($userIds as $uid) {
                    $uid = (int) $uid;
                    $userLogs = $timeLogs->where('user_id', $uid);
                    $total = 0;
                    $streakCount = 0;

                    foreach ($userLogs as $log) {
                        $logStart = Carbon::parse($log->start_time)->copy()->startOfMinute();
                        $logEnd = $log->end_time ? Carbon::parse($log->end_time)->copy()->startOfMinute() : now()->copy()->startOfMinute();
                        
                        if ($logStart->lt($start)) $logStart = $start->copy();
                        if ($logEnd->gt($end)) $logEnd = $end->copy();

                        $streakLen = 0;
                        $current = $logStart->copy();

                        while ($current->lte($logEnd)) {
                            $key = $current->format('Y-m-d H:i');
                            $activity = $perUserMinuteActivity[$uid][$key] ?? 0;

                            if ($activity === 0) {
                                $streakLen++;
                            } else {
                                if ($streakLen >= $minStreak) {
                                    $total += $streakLen;
                                    $streakCount++;
                                }
                                $streakLen = 0;
                            }
                            $current->addMinute();
                        }

                        if ($streakLen >= $minStreak) {
                            $total += $streakLen;
                            $streakCount++;
                        }
                    }

                    $idleTotals[$uid] = $total;
                    $idleStreakCounts[$uid] = $streakCount;
                }
            }

            $teamPresence = $teamPresence->map(function ($p) use ($idleTotals, $idleStreakCounts) {
                $uid = (int) $p->user_id;
                $p->idle_no_movement_minutes_today = (int) ($idleTotals[$uid] ?? 0);
                $p->idle_no_movement_streaks_today = (int) ($idleStreakCounts[$uid] ?? 0);
                return $p;
            });
        }

        return response()->json([
            'success' => true,
            'data' => $teamPresence,
        ]);
    }

    public function idleHistory(Request $request, User $user): JsonResponse
    {
        $viewer = $request->user();
        if (!$viewer || $viewer->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $daysRaw = $request->query('days', 14);
        $days = max(1, min(60, (int) $daysRaw));

        $minStreakRaw = Setting::get('idle_no_movement_minutes', env('IDLE_NO_MOVEMENT_MINUTES', 5));
        $minStreak = max(1, (int) $minStreakRaw);

        $tz = now()->getTimezone();
        $end = now()->endOfDay();
        $start = now()->subDays($days - 1)->startOfDay();

        $cacheKey = 'idle_history:' . $user->id . ':' . $start->format('Y-m-d') . ':' . $end->format('Y-m-d') . ':' . $minStreak;
        try {
            $cached = Cache::get($cacheKey);
            if (is_array($cached)) {
                return response()->json([
                    'success' => true,
                    'data' => $cached,
                ]);
            }
        } catch (\Throwable $e) {
        }

        $shots = Screenshot::where('user_id', $user->id)
            ->whereNotNull('minute_breakdown')
            ->whereBetween('captured_at', [$start, $end])
            ->orderBy('captured_at', 'asc')
            ->get(['minute_breakdown']);

        $perDayMinuteActivity = [];
        foreach ($shots as $shot) {
            $breakdown = $shot->minute_breakdown;
            if (!is_array($breakdown)) continue;

            foreach ($breakdown as $entry) {
                if (!is_array($entry) || !isset($entry['timestamp'])) continue;
                try {
                    $ts = Carbon::parse((string) $entry['timestamp'])->setTimezone($tz);
                } catch (\Throwable $e) {
                    continue;
                }
                if ($ts->lt($start) || $ts->gt($end)) continue;

                $dayKey = $ts->format('Y-m-d');
                $minuteKey = $ts->format('Y-m-d H:i');
                $a = 0;
                $a += (int) ($entry['keyboard_clicks'] ?? 0);
                $a += (int) ($entry['mouse_clicks'] ?? 0);
                $a += (int) ($entry['mouse_scrolls'] ?? 0);
                $a += (int) ($entry['mouse_movements'] ?? 0);
                if (isset($entry['total_activity'])) {
                    $a = max($a, (int) $entry['total_activity']);
                }

                $existing = $perDayMinuteActivity[$dayKey][$minuteKey] ?? null;
                if ($existing === null || $a > $existing) {
                    $perDayMinuteActivity[$dayKey][$minuteKey] = $a;
                }
            }
        }

        $logs = TimeLog::where('user_id', $user->id)
            ->where(function ($q) use ($start, $end) {
                $q->whereBetween('start_time', [$start, $end])
                  ->orWhereBetween('end_time', [$start, $end])
                  ->orWhere(function ($qq) use ($start, $end) {
                      $qq->where('start_time', '<=', $start)->where(function ($qqq) use ($end) {
                          $qqq->whereNull('end_time')->orWhere('end_time', '>=', $end);
                      });
                  });
            })
            ->get(['start_time', 'end_time']);

        $results = [];
        $cursor = $start->copy()->startOfDay();
        while ($cursor->lte($end)) {
            $dayStart = $cursor->copy()->startOfDay();
            $dayEnd = $cursor->copy()->endOfDay();
            $dayKey = $cursor->format('Y-m-d');

            $total = 0;
            $streakCount = 0;

            foreach ($logs as $log) {
                $logStart = Carbon::parse($log->start_time)->setTimezone($tz)->copy()->startOfMinute();
                $logEnd = $log->end_time ? Carbon::parse($log->end_time)->setTimezone($tz)->copy()->startOfMinute() : now()->copy()->startOfMinute();

                if ($logEnd->lt($dayStart) || $logStart->gt($dayEnd)) {
                    continue;
                }

                if ($logStart->lt($dayStart)) $logStart = $dayStart->copy()->startOfMinute();
                if ($logEnd->gt($dayEnd)) $logEnd = $dayEnd->copy()->startOfMinute();

                $streakLen = 0;
                $current = $logStart->copy();

                while ($current->lte($logEnd)) {
                    $minuteKey = $current->format('Y-m-d H:i');
                    $activity = $perDayMinuteActivity[$dayKey][$minuteKey] ?? 0;

                    if ($activity === 0) {
                        $streakLen++;
                    } else {
                        if ($streakLen >= $minStreak) {
                            $total += $streakLen;
                            $streakCount++;
                        }
                        $streakLen = 0;
                    }
                    $current->addMinute();
                }

                if ($streakLen >= $minStreak) {
                    $total += $streakLen;
                    $streakCount++;
                }
            }

            $results[] = [
                'date' => $dayKey,
                'idle_minutes' => $total,
                'streaks' => $streakCount,
            ];

            $cursor->addDay();
        }

        try {
            Cache::put($cacheKey, $results, 600);
        } catch (\Throwable $e) {
        }

        return response()->json([
            'success' => true,
            'data' => $results,
        ]);
    }

    /**
     * Heartbeat endpoint to update employee last_seen and active status.
     */
    public function heartbeat(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $internetConnected = filter_var($request->input('internet_connected', true), FILTER_VALIDATE_BOOLEAN);

        $this->presenceService->heartbeat($userId, $internetConnected);

        return response()->json([
            'success' => true,
            'message' => 'Heartbeat acknowledged.',
        ]);
    }

    /**
     * Manually update user availability status (available, offline, etc.).
     */
    public function updateStatus(Request $request): JsonResponse
    {
        $request->validate([
            'status' => 'required|in:available,offline',
        ]);

        $userId = $request->user()->id;
        $status = $request->input('status');

        $presence = $this->presenceService->updatePresence($userId, $status);

        return response()->json([
            'success' => true,
            'message' => 'Availability status updated.',
            'data' => $presence,
        ]);
    }
}
