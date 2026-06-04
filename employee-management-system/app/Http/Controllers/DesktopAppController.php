<?php

namespace App\Http\Controllers;

use App\Models\TimeLog;
use App\Models\Screenshot;
use App\Models\ActivityLog;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Setting;
use App\Services\TelegramService;
use App\Services\NotificationService;
use App\Mail\WorkLogNotification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class DesktopAppController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function syncTimeLog(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'project_id' => 'required|exists:projects,id',
            'task_id' => 'nullable|exists:tasks,id',
            'start_time' => 'required|date',
            'end_time' => 'nullable|date|after:start_time',
            'duration' => 'nullable|integer|min:0',
            'description' => 'nullable|string',
            'desktop_app_id' => 'required|string',
            'start_work_log' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Prevent duplicate running logs
        // Check for any log that is currently running (end_time is NULL)
        $runningLog = TimeLog::where('user_id', auth()->id())
            ->whereNull('end_time')
            ->latest()
            ->first();

        if ($runningLog) {

            $reqTaskId = $request->task_id;
            $runTaskId = $runningLog->task_id;

            $sameTask = false;
            if (is_null($reqTaskId) && is_null($runTaskId)) {
                $sameTask = true;
            } elseif (!is_null($reqTaskId) && !is_null($runTaskId)) {
                // Compare as strings to handle int vs string types
                $sameTask = (string) $reqTaskId === (string) $runTaskId;
            }

            if ($runningLog->project_id == $request->project_id && $sameTask) {
                // IMPORTANT: We do NOT update start_time here.
                // Touch updated_at to prevent the ghost stopper from killing this log
                // before the new heartbeat starts (handles app reload/redeploy scenarios)
                $runningLog->touch();

                try {
                    app(\App\Services\PresenceService::class)->updatePresence(
                        auth()->id(),
                        'working',
                        $request->project_id,
                        $request->task_id
                    );
                } catch (\Exception $e) {
                }

                return response()->json([
                    'message' => 'Tracking already in progress',
                    'time_log' => $runningLog
                ], 200);
            }

            // If the user is starting a DIFFERENT task, we must stop the previous one.
            // This is valid behavior: you can't do two tasks at once.
            $runningLog->update(['end_time' => now()]);
        }

        $startTime = $request->start_time;

        /*
        // Force server time for web tracker start (to prevent client clock skew)
        if ($request->desktop_app_id === 'web' && (!$request->has('end_time') || !$request->end_time)) {
            $startTime = now();
        }
        */

        $duration = $request->duration;
        if ($request->has('end_time') && $request->end_time) {
            $start = \Carbon\Carbon::parse($startTime);
            $end = \Carbon\Carbon::parse($request->end_time);
            $duration = $start->diffInMinutes($end);
        }

        $timeLog = TimeLog::create([
            'user_id' => auth()->id(),
            'project_id' => $request->project_id,
            'task_id' => $request->task_id,
            'start_time' => $startTime,
            'end_time' => $request->end_time,
            'duration' => $duration,
            'description' => $request->description,
            'start_work_log' => $request->start_work_log,
            'desktop_app_id' => $request->desktop_app_id,
            'is_manual' => false,
        ]);

        Log::info('Update payload', $request->all());

        // Send notifications (non-blocking, errors are logged)
        try {
            $user = auth()->user();
            $project = Project::find($request->project_id);
            $task = $request->task_id ? Task::find($request->task_id) : null;
            $projectName = $project ? $project->name : 'N/A';
            $taskTitle = $task ? $task->title : 'N/A';
            $nowFormatted = now()->format('d M Y, h:i A');
            $action = $request->tracker_action ?? 'start'; // 'start' or 'resume'

            $telegram = new TelegramService();

            // 1. Telegram: Notify admin about tracker event (start/resume)
            try {
                $telegram->notifyTrackerEvent(
                    $action,
                    $user->name,
                    $projectName,
                    $taskTitle,
                    $nowFormatted,
                    $request->start_work_log
                );
            } catch (\Exception $e) {
                Log::error("Telegram {$action} notification error: " . $e->getMessage());
            }

            // 2. Telegram: Send event confirmation to employee if chat_id exists
            if ($user->telegram_chat_id) {
                try {
                    $telegram->notifyEmployeeTrackerEvent(
                        $user->telegram_chat_id,
                        $action,
                        $user->name,
                        $nowFormatted
                    );
                } catch (\Exception $e) {
                    Log::error("Telegram employee {$action} notification error: " . $e->getMessage());
                }
            }
            // 3. In-App Notification: Notify admins and the employee about tracker start/resume
            try {
                $notificationService = app(NotificationService::class);
                $emoji = $action === 'start' ? '🟢' : '▶️';
                $label = $action === 'start' ? 'Tracking Started' : 'Tracking Resumed';
                $adminMsg = $action === 'start' ? "{$user->name} started tracking" : "{$user->name} resumed tracking";
                $employeeMsg = $action === 'start' ? "Tracking Started Successfully" : "Tracking Resumed Successfully";
                
                // Notify admins
                $notificationService->sendToAdmins(
                    'tracking_' . $action,
                    'tracking',
                    "{$emoji} {$label}",
                    $adminMsg,
                    [
                        'user_id' => $user->id,
                        'user_name' => $user->name,
                        'project_id' => $request->project_id,
                        'project_name' => $projectName,
                        'task_title' => $taskTitle,
                        'action' => $action,
                    ],
                    $user->id,
                    $emoji
                );

                // Notify employee
                $notificationService->sendToUser(
                    $user->id,
                    'tracking_' . $action,
                    'tracking',
                    "{$emoji} {$label}",
                    $employeeMsg,
                    [
                        'user_id' => $user->id,
                        'user_name' => $user->name,
                        'project_id' => $request->project_id,
                        'project_name' => $projectName,
                        'task_title' => $taskTitle,
                        'action' => $action,
                    ],
                    $user->id,
                    $emoji
                );
            } catch (\Exception $e) {
                Log::warning('In-app notification error on tracker start: ' . $e->getMessage());
            }
        } catch (\Exception $e) {
            Log::error('Notification setup error on tracker start: ' . $e->getMessage());
        }

        try {
            app(\App\Services\PresenceService::class)->updatePresence(
                auth()->id(),
                'working',
                $request->project_id,
                $request->task_id
            );
        } catch (\Exception $e) {
            Log::error('Presence update error on tracker start: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Time log synced successfully',
            'time_log' => $timeLog
        ], 201);
    }

    public function updateTimeLog(Request $request, TimeLog $timeLog)
    {
        if ($timeLog->user_id !== auth()->id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validator = Validator::make($request->all(), [
            'end_time' => 'nullable|date|after:start_time',
            'duration' => 'nullable|integer|min:0',
            'description' => 'nullable|string',
            'end_work_log' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Check if log is already closed (has end_time)
        if ($timeLog->end_time) {
            // Check if this is a request to add end_work_log to an already closed log (Stop from Paused state)
            if ($request->end_work_log && empty($timeLog->end_work_log)) {
                // We will allow this to proceed to update the end_work_log and send notifications
            } else {
                // If request also provides end_time or use_server_time, it's a stop request.
                if (($request->has('end_time') && $request->end_time) || ($request->has('use_server_time') && $request->use_server_time)) {
                    return response()->json([
                        'message' => 'Time log already closed',
                        'time_log' => $timeLog
                    ]);
                }

                // If request is a heartbeat (no end_time, just duration), we should reject it.
                return response()->json(['message' => 'Time log is closed'], 409);
            }
        }

        $data = $request->only(['end_time', 'duration', 'description', 'end_work_log']);

        // HARD PROTECTION: Ensure start_time is NEVER updated here.
        // Even if it were somehow in $data (it shouldn't be with ->only()), we remove it.
        if (isset($data['start_time'])) {
            unset($data['start_time']);
        }

        // If client requests to use server time (e.g. for "Stop" action to avoid clock skew), override end_time
        if ($request->has('use_server_time') && $request->use_server_time) {
            $data['end_time'] = now();
        }

        if (isset($data['end_time']) && $data['end_time']) {
            $start = $timeLog->start_time;
            $end = \Carbon\Carbon::parse($data['end_time']);
            $data['duration'] = $start->diffInMinutes($end);
        } elseif ($request->has('duration') && !$request->has('end_time')) {
            // Heartbeat: update duration based on elapsed time from start
            $start = $timeLog->start_time;
            $now = now();
            $data['duration'] = $start->diffInMinutes($now);
        }

        $timeLog->update($data);

        // Send notifications for pause/stop events
        $trackerAction = $request->tracker_action; // 'pause' or 'stop'
        if ($trackerAction && in_array($trackerAction, ['pause', 'stop']) && (isset($data['end_time']) || $timeLog->end_time)) {
            try {
                $user = auth()->user();
                $timeLog->load(['project.manager', 'task']);
                $projectName = $timeLog->project ? $timeLog->project->name : 'N/A';
                $taskTitle = $timeLog->task ? $timeLog->task->title : 'N/A';
                $nowFormatted = now()->format('d M Y, h:i A');
                $durationStr = null;
                if ($timeLog->duration) {
                    $hours = floor($timeLog->duration / 60);
                    $mins = $timeLog->duration % 60;
                    $durationStr = ($hours > 0 ? "{$hours}h " : '') . "{$mins}m";
                }

                $telegram = new TelegramService();

                // 1. Telegram: Notify admin about pause/stop event
                try {
                    $telegram->notifyTrackerEvent(
                        $trackerAction,
                        $user->name,
                        $projectName,
                        $taskTitle,
                        $nowFormatted,
                        $request->end_work_log,
                        $durationStr
                    );
                } catch (\Exception $e) {
                    Log::error("Telegram {$trackerAction} notification error: " . $e->getMessage());
                }

                // 2. Telegram: Send event confirmation to employee if chat_id exists
                if ($user->telegram_chat_id) {
                    try {
                        $telegram->notifyEmployeeTrackerEvent(
                            $user->telegram_chat_id,
                            $trackerAction,
                            $user->name,
                            $nowFormatted,
                            $durationStr
                        );
                    } catch (\Exception $e) {
                        Log::error("Telegram employee {$trackerAction} notification error: " . $e->getMessage());
                    }
                }

                // 3. Email: Send end work log to admins and PM only on stop (not pause)
                if ($trackerAction === 'stop' && $request->end_work_log) {
                    try {
                        $admins = User::where('role', 'admin')->get();
                        $manager = $timeLog->project ? $timeLog->project->manager : null;

                        $recipientEmails = [];
                        foreach ($admins as $admin) {
                            if ($admin->email) {
                                $recipientEmails[] = $admin->email;
                            }
                        }
                        if ($manager && $manager->email) {
                            $recipientEmails[] = $manager->email;
                        }
                        $recipientEmails = array_unique($recipientEmails);

                        foreach ($recipientEmails as $email) {
                            try {
                                Mail::to($email)->send(new WorkLogNotification(
                                    $user->name,
                                    $projectName,
                                    $taskTitle,
                                    $request->end_work_log,
                                    'end',
                                    $nowFormatted,
                                    $durationStr
                                ));
                            } catch (\Exception $e) {
                                Log::error("Email stop notification failed for {$email}: " . $e->getMessage());
                            }
                        }
                    } catch (\Exception $e) {
                        Log::error('Email stop notification error: ' . $e->getMessage());
                    }
                }
                // 4. In-App Notification: Notify admins and the employee about tracker pause/stop
                try {
                    $notificationService = app(NotificationService::class);
                    $emoji = $trackerAction === 'pause' ? '⏸️' : '🔴';
                    $label = $trackerAction === 'pause' ? 'Tracking Paused' : 'Tracking Stopped';
                    
                    $adminMsg = $trackerAction === 'pause' ? "{$user->name} paused tracking" : "{$user->name} stopped tracking";
                    $employeeMsg = $trackerAction === 'pause' ? "Your tracking has been paused." : "Your tracking has been stopped.";

                    // Notify admins
                    $notificationService->sendToAdmins(
                        'tracking_' . $trackerAction,
                        'tracking',
                        "{$emoji} {$label}",
                        $adminMsg,
                        [
                            'user_id' => $user->id,
                            'user_name' => $user->name,
                            'project_name' => $projectName,
                            'task_title' => $taskTitle,
                            'action' => $trackerAction,
                            'duration' => $durationStr,
                        ],
                        $user->id,
                        $emoji
                    );

                    // Notify employee
                    $notificationService->sendToUser(
                        $user->id,
                        'tracking_' . $trackerAction,
                        'tracking',
                        "{$emoji} {$label}",
                        $employeeMsg,
                        [
                            'user_id' => $user->id,
                            'user_name' => $user->name,
                            'project_name' => $projectName,
                            'task_title' => $taskTitle,
                            'action' => $trackerAction,
                            'duration' => $durationStr,
                        ],
                        $user->id,
                        $emoji
                    );

                    // If stop and work log is submitted
                    if ($trackerAction === 'stop' && ($request->end_work_log || $request->description)) {
                        $notificationService->sendToUser(
                            $user->id,
                            'work_log_submitted',
                            'work',
                            '📝 Work Log Submitted Successfully',
                            'Your work log has been submitted successfully.',
                            [
                                'user_id' => $user->id,
                                'project_name' => $projectName,
                                'task_title' => $taskTitle,
                            ],
                            $user->id,
                            '📝'
                        );
                    }
                } catch (\Exception $e) {
                    Log::warning('In-app notification error on tracker update: ' . $e->getMessage());
                }
            } catch (\Exception $e) {
                Log::error('Notification setup error on tracker update: ' . $e->getMessage());
            }
        }

        if ($trackerAction && in_array($trackerAction, ['pause', 'stop'])) {
            try {
                $status = $trackerAction === 'pause' ? 'paused' : 'available';
                app(\App\Services\PresenceService::class)->updatePresence(
                    auth()->id(),
                    $status,
                    $status === 'paused' ? $timeLog->project_id : null,
                    $status === 'paused' ? $timeLog->task_id : null
                );
            } catch (\Exception $e) {
                Log::error('Presence update error on tracker stop/pause: ' . $e->getMessage());
            }
        }

        return response()->json([
            'message' => 'Time log updated successfully',
            'time_log' => $timeLog
        ]);
    }

    public function uploadScreenshot(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'project_id' => 'required|exists:projects,id',
            'screenshot' => 'required|image|max:5120', // 5MB max
            'captured_at' => 'required|date',
            'desktop_app_id' => 'required|string',
            'minute_breakdown' => 'nullable',
            'time_log_id' => 'nullable|exists:time_logs,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $file = $request->file('screenshot');
        $path = $file->store('screenshots/' . date('Y/m/d'), 'public');

        $minuteBreakdown = $request->input('minute_breakdown');
        if (is_string($minuteBreakdown)) {
            $minuteBreakdown = json_decode($minuteBreakdown, true);
        }

        if (is_array($minuteBreakdown)) {
            // Fix: Filter out old activity data that might be re-sent by the client.
            // We only keep activity data within 15 minutes of the capture time (assuming 10-min interval).
            try {
                $capturedAt = \Carbon\Carbon::parse($request->captured_at);
                // Allow a buffer (e.g., 12 minutes) to cover the 10-minute interval plus some drift
                $threshold = $capturedAt->copy()->subMinutes(12);

                $minuteBreakdown = array_values(array_filter($minuteBreakdown, function ($m) use ($threshold, $capturedAt) {
                    if (!isset($m['timestamp']))
                        return false;
                    $mTime = \Carbon\Carbon::parse($m['timestamp']);
                    // Keep if it's newer than threshold AND not in the future relative to capture + buffer
                    return $mTime->gte($threshold) && $mTime->lte($capturedAt->copy()->addMinutes(2));
                }));
            } catch (\Exception $e) {
                // If date parsing fails, keep original or empty? Keep original to be safe, or log error.
                // For now, suppress error and proceed.
            }

            /*
            foreach ($minuteBreakdown as $minute) {
                ActivityLog::create([
                    'user_id' => auth()->id(),
                    'project_id' => $request->project_id,
                    'time_log_id' => $request->time_log_id,
                    'activity_type' => 'input_counts',
                    'window_title' => 'Time Tracker',
                    'application_name' => 'Web Tracker',
                    'url' => url()->previous(),
                    'started_at' => $minute['timestamp'] ?? now(),
                    'ended_at' => isset($minute['timestamp']) ? \Carbon\Carbon::parse($minute['timestamp'])->addMinute() : now(),
                    'duration' => 60,
                    'keyboard_count' => $minute['keyboard_clicks'] ?? 0,
                    'mouse_click_count' => $minute['mouse_clicks'] ?? 0,
                    'mouse_scroll_count' => $minute['mouse_scrolls'] ?? 0,
                    'desktop_app_id' => $request->desktop_app_id,
                ]);
            }
            */
        }

        $screenshot = Screenshot::create([
            'user_id' => auth()->id(),
            'project_id' => $request->project_id,
            'time_log_id' => $request->time_log_id,
            'file_path' => $path,
            'file_name' => $file->getClientOriginalName(),
            'file_size' => $file->getSize(),
            'mime_type' => $file->getMimeType(),
            'captured_at' => $request->captured_at,
            'desktop_app_id' => $request->desktop_app_id,
            'minute_breakdown' => $minuteBreakdown,
        ]);

        try {
            $user = auth()->user();
            if ($user && $user->role === 'employee' && is_array($minuteBreakdown)) {
                $idleMinutesRaw = Setting::get('idle_no_movement_minutes', env('IDLE_NO_MOVEMENT_MINUTES', 5));
                $idleMinutes = max(1, (int) $idleMinutesRaw);
                $cooldownSecondsRaw = Setting::get('idle_no_movement_cooldown_seconds', env('IDLE_NO_MOVEMENT_COOLDOWN_SECONDS', 1800));
                $cooldownSeconds = max(60, (int) $cooldownSecondsRaw);

                $capturedAt = \Carbon\Carbon::parse($request->captured_at);

                $runningLog = null;
                if ($request->time_log_id) {
                    $runningLog = TimeLog::with(['project', 'task'])
                        ->where('id', $request->time_log_id)
                        ->where('user_id', $user->id)
                        ->whereNull('end_time')
                        ->first();
                }
                if (!$runningLog) {
                    $runningLog = TimeLog::with(['project', 'task'])
                        ->where('user_id', $user->id)
                        ->whereNull('end_time')
                        ->latest()
                        ->first();
                }
                if (!$runningLog) {
                    throw new \RuntimeException('No running time log found for idle check.');
                }

                $windowStart = $capturedAt->copy()->subMinutes($idleMinutes)->subSeconds(30);
                $windowEnd = $capturedAt->copy()->addSeconds(30);

                $recentShots = Screenshot::where('time_log_id', $runningLog->id)
                    ->whereNotNull('minute_breakdown')
                    ->whereBetween('captured_at', [$windowStart->copy()->subMinutes(2), $windowEnd->copy()->addMinutes(2)])
                    ->orderBy('captured_at', 'desc')
                    ->take(25)
                    ->get(['id', 'captured_at', 'minute_breakdown']);

                $minuteActivity = [];
                $rangeStart = null;
                $rangeEnd = null;

                foreach ($recentShots as $shot) {
                    $breakdown = $shot->minute_breakdown;
                    if (!is_array($breakdown)) continue;

                    foreach ($breakdown as $entry) {
                        if (!is_array($entry) || !isset($entry['timestamp'])) continue;

                        try {
                            $ts = \Carbon\Carbon::parse((string) $entry['timestamp']);
                        } catch (\Throwable $e) {
                            continue;
                        }

                        if ($ts->lt($windowStart) || $ts->gt($windowEnd)) continue;

                        $key = $ts->format('Y-m-d H:i');
                        $a = 0;
                        $a += (int) ($entry['keyboard_clicks'] ?? 0);
                        $a += (int) ($entry['mouse_clicks'] ?? 0);
                        $a += (int) ($entry['mouse_scrolls'] ?? 0);
                        $a += (int) ($entry['mouse_movements'] ?? 0);
                        if (isset($entry['total_activity'])) {
                            $a = max($a, (int) $entry['total_activity']);
                        }

                        $minuteActivity[$key] = max($minuteActivity[$key] ?? 0, $a);
                        if (!$rangeStart || $ts->lt($rangeStart)) {
                            $rangeStart = $ts;
                        }
                        if (!$rangeEnd || $ts->gt($rangeEnd)) {
                            $rangeEnd = $ts;
                        }
                    }
                }

                if (count($minuteActivity) < $idleMinutes) {
                    return response()->json([
                        'message' => 'Screenshot uploaded successfully',
                        'screenshot' => $screenshot,
                        'url' => url(Storage::url($path))
                    ], 201);
                }

                $total = array_sum($minuteActivity);
                if ($total !== 0) {
                    return response()->json([
                        'message' => 'Screenshot uploaded successfully',
                        'screenshot' => $screenshot,
                        'url' => url(Storage::url($path))
                    ], 201);
                }

                $rangeStartStr = $rangeStart instanceof \Carbon\Carbon ? $rangeStart->toIso8601String() : $windowStart->toIso8601String();
                $rangeEndStr = $rangeEnd instanceof \Carbon\Carbon ? $rangeEnd->toIso8601String() : $windowEnd->toIso8601String();

                $cacheKey = "idle_no_movement_admin_{$user->id}_{$runningLog->id}_" . md5($rangeStartStr . '|' . $rangeEndStr . '|' . $idleMinutes);
                if (Cache::has($cacheKey)) {
                    return response()->json([
                        'message' => 'Screenshot uploaded successfully',
                        'screenshot' => $screenshot,
                        'url' => url(Storage::url($path))
                    ], 201);
                }

                $projectName = $runningLog->project?->name ?? 'N/A';
                $taskTitle = $runningLog->task?->title ?? 'N/A';
                $title = "⚠️ No Movement Detected";
                                $message = "No movement detected for {$user->name} in the last {$idleMinutes} minutes (tracking is ON).";

                app(NotificationService::class)->sendToAdmins(
                    'idle_no_movement',
                    'tracking',
                    $title,
                    $message,
                    [
                        'user_id' => $user->id,
                        'user_name' => $user->name,
                        'time_log_id' => $runningLog->id,
                        'project_id' => $runningLog->project_id,
                        'project_name' => $projectName,
                        'task_id' => $runningLog->task_id,
                        'task_title' => $taskTitle,
                        'idle_minutes' => $idleMinutes,
                        'range_start' => $rangeStartStr,
                        'range_end' => $rangeEndStr,
                        'samples' => count($minuteActivity),
                    ],
                    $user->id,
                    '⚠️'
                );

                Cache::put($cacheKey, true, $cooldownSeconds);
            }
        } catch (\Throwable $e) {
            Log::warning('Idle movement check failed on screenshot upload: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Screenshot uploaded successfully',
            'screenshot' => $screenshot,
            'url' => url(Storage::url($path))
        ], 201);
    }

    public function syncActivityLog(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'project_id' => 'required|exists:projects,id',
            'activity_type' => 'required|string',
            'window_title' => 'nullable|string|max:255',
            'application_name' => 'nullable|string|max:255',
            'url' => 'nullable|url|max:255',
            'started_at' => 'required|date',
            'ended_at' => 'nullable|date|after:started_at',
            'duration' => 'nullable|integer|min:0',
            'keyboard_count' => 'nullable|integer|min:0',
            'mouse_click_count' => 'nullable|integer|min:0',
            'mouse_scroll_count' => 'nullable|integer|min:0',
            'desktop_app_id' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        /*
        $activityLog = ActivityLog::create([
            'user_id' => auth()->id(),
            'project_id' => $request->project_id,
            'activity_type' => $request->activity_type,
            'window_title' => $request->window_title,
            'application_name' => $request->application_name,
            'url' => $request->url,
            'started_at' => $request->started_at,
            'ended_at' => $request->ended_at,
            'duration' => $request->duration,
            'keyboard_count' => $request->keyboard_count ?? 0,
            'mouse_click_count' => $request->mouse_click_count ?? 0,
            'mouse_scroll_count' => $request->mouse_scroll_count ?? 0,
            'desktop_app_id' => $request->desktop_app_id,
        ]);
        */
        $activityLog = null; // Placeholder

        return response()->json([
            'message' => 'Activity log synced successfully',
            'activity_log' => $activityLog
        ], 201);
    }

    public function getActiveProjects()
    {
        $user = auth()->user();
        $projects = Project::where(function ($q) {
            $q->where('status', 'in_progress')
                ->orWhere('status', 'planning');
        })
            ->when($user->role !== 'admin', function ($query) use ($user) {
                $query->where(function ($q) use ($user) {
                    $q->where('manager_id', $user->id)
                        ->orWhereHas('tasks', function ($tq) use ($user) {
                            $tq->where('assigned_to', $user->id);
                        });
                });
            })
            ->orderBy('name')
            ->get(['id', 'name', 'status']);

        return response()->json($projects);
    }

    public function getAssignedProjects()
    {
        $projectIds = Task::where('assigned_to', auth()->id())->pluck('project_id')->unique()->values();
        $projects = Project::whereIn('id', $projectIds)->orderBy('name')->get(['id', 'name', 'status']);
        return response()->json($projects);
    }

    public function getProjectTasksForUser(Project $project)
    {
        $tasks = Task::where('project_id', $project->id)
            ->where('assigned_to', auth()->id())
            ->orderBy('title')
            ->get(['id', 'title', 'status', 'priority', 'due_date', 'project_id', 'assigned_to']);

        return response()->json($tasks);
    }

    public function getUserTimeLogs(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = TimeLog::where('user_id', auth()->id())
            ->with(['project', 'task']);

        // if ($request->has('start_date')) {
        //     $query->whereDate('start_time', '>=', $request->start_date);
        // }

        if ($request->has('end_date')) {
            $query->whereDate('start_time', '<=', $request->end_date);
        }

        $timeLogs = $query->latest()->get();

        return response()->json($timeLogs);
    }

    public function getUserScreenshots(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'project_id' => 'nullable|exists:projects,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $query = Screenshot::where('user_id', auth()->id())
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

        // Add absolute URLs to screenshots
        $screenshots->each(function ($screenshot) {
            $screenshot->url = url(Storage::url($screenshot->file_path));
        });

        return response()->json($screenshots);
    }

    public function submitBatch(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'project_id' => 'required|exists:projects,id',
            'task_id' => 'required|exists:tasks,id',
            'batch_started_at' => 'required|date',
            'batch_ended_at' => 'required|date|after:batch_started_at',
            'desktop_app_id' => 'required|string',
            'events' => 'nullable',
            'note' => 'nullable|string',
            'shot1' => 'nullable|image|max:5120',
            'shot1_captured_at' => 'required_with:shot1|date',
            'shot2' => 'nullable|image|max:5120',
            'shot2_captured_at' => 'required_with:shot2|date',
            'shot3' => 'nullable|image|max:5120',
            'shot3_captured_at' => 'required_with:shot3|date',
            'shot4' => 'nullable|image|max:5120',
            'shot4_captured_at' => 'required_with:shot4|date',
        ]);
        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }
        $durationMinutes = ceil((strtotime($request->batch_ended_at) - strtotime($request->batch_started_at)) / 60);
        $timeLog = TimeLog::create([
            'user_id' => auth()->id(),
            'project_id' => $request->project_id,
            'task_id' => $request->task_id,
            'start_time' => $request->batch_started_at,
            'end_time' => $request->batch_ended_at,
            'duration' => $durationMinutes,
            'description' => $request->note,
            'desktop_app_id' => $request->desktop_app_id,
            'is_manual' => false,
        ]);
        $screens = [];
        foreach ([1, 2, 3, 4] as $i) {
            $fileKey = 'shot' . $i;
            $tsKey = 'shot' . $i . '_captured_at';
            if ($request->hasFile($fileKey)) {
                $file = $request->file($fileKey);
                $path = $file->store('screenshots/' . date('Y/m/d'), 'public');
                $s = Screenshot::create([
                    'user_id' => auth()->id(),
                    'project_id' => $request->project_id,
                    'time_log_id' => $timeLog->id,
                    'file_path' => $path,
                    'file_name' => $file->getClientOriginalName(),
                    'file_size' => $file->getSize(),
                    'mime_type' => $file->getMimeType(),
                    'captured_at' => $request->input($tsKey),
                    'desktop_app_id' => $request->desktop_app_id,
                ]);
                $s->url = url(Storage::url($path));
                $screens[] = $s;
            }
        }
        $eventsPayload = $request->input('events');
        if (is_string($eventsPayload)) {
            $decoded = json_decode($eventsPayload, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $eventsPayload = $decoded;
            } else {
                $eventsPayload = null;
            }
        }
        $activities = [];
        if (is_array($eventsPayload)) {
            /*
            foreach ($eventsPayload as $ev) {
                $activity = ActivityLog::create([
                    'user_id' => auth()->id(),
                    'project_id' => $request->project_id,
                    'time_log_id' => $timeLog->id,
                    'activity_type' => $ev['activity_type'] ?? 'active',
                    'window_title' => $ev['window_title'] ?? null,
                    'application_name' => $ev['application_name'] ?? null,
                    'url' => $ev['url'] ?? null,
                    'started_at' => $ev['started_at'] ?? $request->batch_started_at,
                    'ended_at' => $ev['ended_at'] ?? null,
                    'duration' => $ev['duration'] ?? null,
                    'desktop_app_id' => $request->desktop_app_id,
                ]);
                $activities[] = $activity;
            }
            */
        }

        // Notify employee about work log submission
        try {
            $notificationService = app(NotificationService::class);
            $user = auth()->user();
            $project = Project::find($request->project_id);
            $task = $request->task_id ? Task::find($request->task_id) : null;
            $projectName = $project ? $project->name : 'N/A';
            $taskTitle = $task ? $task->title : 'N/A';

            $notificationService->sendToUser(
                $user->id,
                'work_log_submitted',
                'work',
                '📝 Work Log Submitted Successfully',
                'Your work log has been submitted successfully.',
                [
                    'user_id' => $user->id,
                    'project_name' => $projectName,
                    'task_title' => $taskTitle,
                ],
                $user->id,
                '📝'
            );
        } catch (\Exception $e) {
            Log::warning('In-app notification error on batch submit: ' . $e->getMessage());
        }

        return response()->json([
            'message' => 'Batch submitted successfully',
            'time_log' => $timeLog,
            'screenshots' => $screens,
            'activity_count' => count($activities)
        ], 201);
    }
}
