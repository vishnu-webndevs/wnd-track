<?php

namespace App\Http\Controllers;

use App\Models\Screenshot;
use App\Models\Setting;
use App\Services\PresenceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $viewer = $request->user();
        if ($viewer && $viewer->role === 'admin') {
            $minStreakRaw = Setting::get('idle_summary_min_streak_minutes', env('IDLE_SUMMARY_MIN_STREAK_MINUTES', 3));
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

                foreach ($userIds as $uid) {
                    $uid = (int) $uid;
                    $minutes = $perUserMinuteActivity[$uid] ?? [];
                    if (empty($minutes)) {
                        $idleTotals[$uid] = 0;
                        $idleStreakCounts[$uid] = 0;
                        continue;
                    }

                    ksort($minutes);
                    $prevTs = null;
                    $streakLen = 0;
                    $total = 0;
                    $streakCount = 0;

                    foreach ($minutes as $minuteKey => $activity) {
                        $ts = Carbon::createFromFormat('Y-m-d H:i', $minuteKey, $start->getTimezone());

                        $consecutive = false;
                        if ($prevTs instanceof Carbon) {
                            $consecutive = $ts->diffInMinutes($prevTs) === 1 && $ts->greaterThan($prevTs);
                        }

                        if (!$consecutive) {
                            if ($streakLen >= $minStreak) {
                                $total += $streakLen;
                                $streakCount++;
                            }
                            $streakLen = 0;
                        }

                        if ((int) $activity === 0) {
                            $streakLen++;
                        } else {
                            if ($streakLen >= $minStreak) {
                                $total += $streakLen;
                                $streakCount++;
                            }
                            $streakLen = 0;
                        }

                        $prevTs = $ts;
                    }

                    if ($streakLen >= $minStreak) {
                        $total += $streakLen;
                        $streakCount++;
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
