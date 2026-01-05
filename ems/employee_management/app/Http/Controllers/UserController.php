<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\TimeLog;
use App\Models\Screenshot;
use App\Models\ActivityLog;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class UserController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index(Request $request)
    {
        $this->authorize('viewAny', User::class);

        $users = User::query()
            ->when($request->search, function ($query, $search) {
                $query->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('department', 'like', "%{$search}%");
            })
            ->when($request->role, function ($query, $role) {
                $query->where('role', $role);
            })
            ->when($request->status, function ($query, $status) {
                $query->where('status', $status);
            })
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json($users);
    }

    public function store(Request $request)
    {
        $this->authorize('create', User::class);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'required|in:admin,employee',
            'phone' => 'nullable|string|max:20',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'status' => 'in:active,inactive',
            'hire_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'phone' => $request->phone,
            'department' => $request->department,
            'position' => $request->position,
            'status' => $request->status ?? 'active',
            'hire_date' => $request->hire_date,
        ]);

        return response()->json([
            'message' => 'User created successfully',
            'user' => $user
        ], 201);
    }

    public function show(User $user)
    {
        $this->authorize('view', $user);

        return response()->json([
            'user' => $user->load(['projects', 'assignedTasks', 'timeLogs'])
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->authorize('update', $user);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:255',
            'email' => 'sometimes|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'sometimes|string|min:8|confirmed',
            'role' => 'sometimes|in:admin,employee',
            'phone' => 'nullable|string|max:20',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'status' => 'sometimes|in:active,inactive',
            'hire_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->only(['name', 'email', 'role', 'phone', 'department', 'position', 'status', 'hire_date']);
        
        if ($request->filled('password')) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);

        return response()->json([
            'message' => 'User updated successfully',
            'user' => $user
        ]);
    }

    public function destroy(User $user)
    {
        $this->authorize('delete', $user);

        if ($user->id === auth()->id()) {
            return response()->json(['message' => 'You cannot delete your own account'], 403);
        }

        $user->delete();

        return response()->json([
            'message' => 'User deleted successfully'
        ]);
    }

    public function resetPassword(Request $request, User $user)
    {
        $this->authorize('update', $user);

        $validator = Validator::make($request->all(), [
            'password' => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $user->update([
            'password' => Hash::make($request->password)
        ]);

        return response()->json([
            'message' => 'Password reset successfully'
        ]);
    }

    public function getTimeLogs(Request $request, User $user)
    {
        $this->authorize('view', $user);

        $validator = Validator::make($request->all(), [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = TimeLog::where('user_id', $user->id)
            ->with(['project', 'task']);

        if ($request->has('start_date')) {
            $query->whereDate('start_time', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('start_time', '<=', $request->end_date);
        }

        $timeLogs = $query->latest()->get();

        return response()->json($timeLogs);
    }

    public function getScreenshots(Request $request, User $user)
    {
        $this->authorize('view', $user);

        $validator = Validator::make($request->all(), [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date',
            'project_id' => 'nullable|exists:projects,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = Screenshot::where('user_id', $user->id)
            ->with(['project']);

        if ($request->has('start_date')) {
            $query->whereDate('captured_at', '>=', $request->start_date);
        }

        if ($request->has('end_date')) {
            $query->whereDate('captured_at', '<=', $request->end_date);
        }

        if ($request->has('project_id')) {
            $query->where('project_id', $request->project_id);
        }

        $screenshots = $query->latest()->get();

        $screenshots->each(function ($screenshot) {
            $screenshot->url = url(Storage::url($screenshot->file_path));
        });

        return response()->json($screenshots);
    }

    public function getActivitySummary(Request $request, User $user)
    {
        $this->authorize('view', $user);

        $validator = Validator::make($request->all(), [
            'start_time' => 'required|date',
            'end_time' => 'required|date|after_or_equal:start_time',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $start = $request->start_time;
        $end = $request->end_time;

        // Prepare UTC times for database querying (since DB stores in UTC)
        $startUTC = (new \DateTime($start))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $endUTC = (new \DateTime($end))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');

        // Initialize summary with all minutes in range (using local time)
        $summary = [];
        $startDt = new \DateTime($start);
        $endDt = new \DateTime($end);
        
        // Round down start to minute
        $startDt->setTime((int)$startDt->format('H'), (int)$startDt->format('i'), 0);
        
        // Round up end to minute
        $endDt->setTime((int)$endDt->format('H'), (int)$endDt->format('i'), 0);
        if ($endDt < new \DateTime($end)) {
             $endDt->modify('+1 minute');
        }

        $interval = new \DateInterval('PT1M');
        // Include the end minute by adding 1 minute to the end period
        $periodEnd = clone $endDt;
        $periodEnd->add(new \DateInterval('PT1M'));
        
        $period = new \DatePeriod($startDt, $interval, $periodEnd);

        foreach ($period as $dt) {
            $m = $dt->format('Y-m-d H:i:00');
            // Ensure strictly within range if needed, but minute buckets are usually fine
            // We'll keep all minutes in the period to avoid gaps
            $summary[$m] = [
                'minute' => $m,
                'app_focus' => 0,
                'window_switch' => 0,
                'idle' => 0,
                'active' => 0,
                'mouse_click' => 0,
                'keyboard_input' => 0,
                'scroll' => 0,
                'total' => 0,
            ];
        }

        // 1. Process ActivityLog (Legacy/Other events)
        $rows = ActivityLog::where('user_id', $user->id)
            ->where(function ($q) use ($startUTC, $endUTC) {
                $q->whereBetween('started_at', [$startUTC, $endUTC])
                  ->orWhereBetween('ended_at', [$startUTC, $endUTC])
                  ->orWhere(function ($q2) use ($startUTC, $endUTC) {
                      $q2->where('started_at', '<=', $startUTC)
                         ->where(function ($q3) use ($endUTC) {
                             $q3->whereNull('ended_at')->orWhere('ended_at', '>=', $endUTC);
                         });
                  });
            })
            ->selectRaw((DB::getDriverName() === 'sqlite'
                ? "strftime('%Y-%m-%d %H:%M:00', CASE WHEN started_at < ? THEN ? ELSE started_at END)"
                : "DATE_FORMAT(CASE WHEN started_at < ? THEN ? ELSE started_at END, '%Y-%m-%d %H:%i:00')")
                . " as minute, activity_type, SUM(duration) as count", [$startUTC, $startUTC])
            ->groupBy('minute', 'activity_type')
            ->orderBy('minute', 'asc')
            ->get();

        foreach ($rows as $row) {
            // $row->minute is in UTC, need to convert to local time key
            try {
                $rowDt = new \DateTime($row->minute, new \DateTimeZone('UTC'));
                $rowDt->setTimezone($startDt->getTimezone());
                $m = $rowDt->format('Y-m-d H:i:00');
            } catch (\Exception $e) {
                $m = $row->minute;
            }

            if (isset($summary[$m])) {
                $type = $row->activity_type;
                $count = (int) $row->count;
                if (isset($summary[$m][$type])) {
                    $summary[$m][$type] += $count;
                }
                $summary[$m]['total'] += $count;
            }
        }


        // 2. Process Screenshots minute_breakdown
        // Fetch screenshots captured around the time range (using UTC for query)
        $screenshots = Screenshot::where('user_id', $user->id)
            ->whereBetween('captured_at', [
                (new \DateTime($startUTC))->modify('-1 hour'), 
                (new \DateTime($endUTC))->modify('+1 hour')
            ])
            ->get();

        foreach ($screenshots as $shot) {
            if (!empty($shot->minute_breakdown) && is_array($shot->minute_breakdown)) {
                foreach ($shot->minute_breakdown as $entry) {
                    if (isset($entry['timestamp'])) {
                        // Format to minute using the same timezone as the summary
                        try {
                            $entryDt = new \DateTime($entry['timestamp']);
                            $entryDt->setTimezone($startDt->getTimezone());
                            $ts = $entryDt->format('Y-m-d H:i:00');
                        } catch (\Exception $e) {
                            continue;
                        }
                        
                        // Debug logging
                        // \Log::info("Processing screenshot breakdown: TS=$ts, SummaryKeyExists=" . (isset($summary[$ts]) ? 'YES' : 'NO'));

                        // Only process if this minute is in our summary range
                        if (isset($summary[$ts])) {
                             $clicks = $entry['mouse_clicks'] ?? 0;
                             $keys = $entry['keyboard_clicks'] ?? 0;
                             $movements = $entry['mouse_movements'] ?? 0;
                             $total = $entry['total_activity'] ?? ($clicks + $keys + $movements);
                             
                             // Add to summary
                             // Note: If ActivityLog also tracks this, we might be double counting.
                             // Assuming ActivityLog is mostly empty or tracks different things (like duration).
                             // We will trust minute_breakdown for clicks/keys.
                             
                             // Use max or sum? If ActivityLog has 0 and this has 5, we want 5.
                             // If we just add, it's safe.
                             $summary[$ts]['mouse_click'] += $clicks;
                             $summary[$ts]['keyboard_input'] += $keys;
                             $summary[$ts]['scroll'] += $entry['mouse_scrolls'] ?? 0;
                             
                             // For 'active', let's treat it as a score or count
                             if ($total > 0) {
                                 // If total > 0, it's an active minute. 
                                 // The 'active' field in UI seems to be a counter.
                                 // Let's add movements to 'active' or just leave it?
                                 // The UI shows "Active".
                                 $summary[$ts]['active'] += $movements; 
                             }
                             
                             $summary[$ts]['total'] += $total;
                        }
                    }
                }
            }
        }

        ksort($summary);
        return response()->json(array_values($summary));
    }

    public function triggerLive(Request $request, User $user)
    {
        // Allow admin/manager to trigger live view for a user
        Cache::put('live_view_' . $user->id, true, 60); // 1 minute
        return response()->json(['message' => 'Live view triggered']);
    }

    public function stopLive(Request $request, User $user)
    {
        Cache::forget('live_view_' . $user->id);
        return response()->json(['message' => 'Live view stopped']);
    }

    public function checkLiveStatus(Request $request)
    {
        // User checks if they should be streaming
        $isLive = Cache::get('live_view_' . auth()->id(), false);
        return response()->json(['live_mode' => $isLive]);
    }
}
