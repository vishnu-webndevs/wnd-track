<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\ClientController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DesktopAppController;
use App\Http\Controllers\TwoFactorController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\TeamAvailabilityController;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\VoiceController;
use App\Http\Controllers\MeetingController;
use App\Http\Middleware\AdminTwoFactorMiddleware;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
|
*/
Route::get('/up', function () {
    return response()->json(['status' => 'ok']);
});

Route::middleware([\App\Http\Middleware\AttachSanctumTokenFromCookie::class, 'auth:sanctum'])->get('/test-auth', function (Request $request) {
    return response()->json([
        'authenticated' => true,
        'user_id' => $request->user()?->id,
        'user_name' => $request->user()?->name,
        'headers' => $request->headers->all(),
        'cookies' => $request->cookies->all(),
    ]);
});

// Public routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth routes
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'user']);
    Route::get('/user/live-status', [UserController::class, 'checkLiveStatus']);
    Route::put('/settings/telegram-worklog', [UserController::class, 'updateTelegramWorklogSetting']);
    Route::get('/settings/telegram-worklog', [UserController::class, 'getTelegramWorklogSetting']);
    
    // Sessions
    Route::get('/sessions', [\App\Http\Controllers\SessionController::class, 'index']);
    Route::delete('/sessions/{id}', [\App\Http\Controllers\SessionController::class, 'revoke']);

    // 2FA Routes
    Route::post('/2fa/send', [TwoFactorController::class, 'sendOtp']);
    Route::post('/2fa/verify', [TwoFactorController::class, 'verifyOtp']);
    Route::get('/2fa/status', [TwoFactorController::class, 'checkStatus']);
    Route::get('/2fa/settings', [TwoFactorController::class, 'getSettings']);
    Route::post('/2fa/settings', [TwoFactorController::class, 'updateSettings']);
    Route::post('/2fa/totp/setup', [TwoFactorController::class, 'setupTotp']);
    Route::post('/2fa/totp/verify', [TwoFactorController::class, 'verifyAndEnableTotp']);
    Route::post('/2fa/totp/disconnect', [TwoFactorController::class, 'disconnectTotp']);
    Route::post('/2fa/backup-codes/generate', [TwoFactorController::class, 'generateBackupCodes']);

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::put('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::put('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::get('/notifications/preferences', [NotificationController::class, 'getPreferences']);
    Route::put('/notifications/preferences', [NotificationController::class, 'updatePreferences']);
    Route::post('/notifications/log', [NotificationController::class, 'logClientEvent']);
    Route::post('/notifications/broadcast', [NotificationController::class, 'broadcast']);

    // Team Availability
    Route::get('/team/availability', [TeamAvailabilityController::class, 'index']);
    Route::post('/team/heartbeat', [TeamAvailabilityController::class, 'heartbeat']);
    Route::post('/team/status', [TeamAvailabilityController::class, 'updateStatus']);

    // Chat Routes
    Route::get('/chat/conversations', [ChatController::class, 'index']);
    Route::post('/chat/conversations', [ChatController::class, 'store']);
    Route::delete('/chat/conversations/{id}', [ChatController::class, 'destroy']);
    Route::delete('/chat/conversations/{id}/messages', [ChatController::class, 'clearMessages']);
    Route::post('/chat/conversations/{id}/participants', [ChatController::class, 'addParticipant']);
    Route::delete('/chat/conversations/{id}/participants/{userId}', [ChatController::class, 'removeParticipant']);
    Route::get('/chat/conversations/{id}/messages', [ChatController::class, 'messages']);
    Route::post('/chat/conversations/{id}/messages', [ChatController::class, 'sendMessage']);
    Route::put('/chat/conversations/{id}/read', [ChatController::class, 'markRead']);
    Route::get('/chat/unread-count', [ChatController::class, 'totalUnread']);
    Route::post('/chat/conversations/{id}/typing', [ChatController::class, 'typing']);

    // Voice Routes
    Route::post('/voice/initiate', [VoiceController::class, 'initiate']);
    Route::post('/voice/signal', [VoiceController::class, 'signal']);
    Route::post('/voice/end', [VoiceController::class, 'end']);
    Route::get('/voice/ice-servers', [VoiceController::class, 'iceServers']);

    // Meeting Routes
    Route::get('/meetings', [MeetingController::class, 'index']);
    Route::post('/meetings', [MeetingController::class, 'store']);
    Route::get('/meetings/{id}', [MeetingController::class, 'show']);
    Route::put('/meetings/{id}', [MeetingController::class, 'update']);
    Route::delete('/meetings/{id}', [MeetingController::class, 'destroy']);
    Route::post('/meetings/{id}/start', [MeetingController::class, 'start']);
    Route::post('/meetings/{id}/end', [MeetingController::class, 'end']);
    Route::post('/meetings/{id}/join', [MeetingController::class, 'join']);
    Route::post('/meetings/{id}/leave', [MeetingController::class, 'leave']);
    Route::post('/meetings/{id}/respond', [MeetingController::class, 'respond']);
    Route::get('/meetings/{id}/messages', [MeetingController::class, 'messages']);
    Route::post('/meetings/{id}/messages', [MeetingController::class, 'sendMessage']);

    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/dashboard/time-analytics', [DashboardController::class, 'getTimeAnalytics']);

    // Users (Employees)
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::get('/users/{user}', [UserController::class, 'show']);
    Route::put('/users/{user}', [UserController::class, 'update']);
    Route::delete('/users/{user}', [UserController::class, 'destroy']);
    Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
    Route::get('/users/{user}/assigned-projects', [UserController::class, 'getAssignedProjects']);
    Route::get('/users/{user}/projects/{project}/assigned-tasks', [UserController::class, 'getAssignedProjectTasks']);
    Route::put('/time-logs/{timeLog}/notes', [UserController::class, 'updateTimeLogEmployee']);

    // Timesheets and Monitoring Protected by 2FA for Admins
    Route::middleware(AdminTwoFactorMiddleware::class)->group(function () {
        Route::get('/team/idle-history/{user}', [TeamAvailabilityController::class, 'idleHistory']);
        Route::get('/users/{user}/time-logs', [UserController::class, 'getTimeLogs']);
        Route::post('/users/{user}/time-logs', [UserController::class, 'storeTimeLog']);
        Route::put('/users/{user}/time-logs/{timeLog}', [UserController::class, 'updateTimeLogAdmin']);
        Route::get('/users/{user}/screenshots', [UserController::class, 'getScreenshots']);
        Route::delete('/users/{user}/screenshots/{screenshot}', [UserController::class, 'deleteScreenshot']);
        Route::get('/users/{user}/screenshots/{screenshot}/file', [UserController::class, 'getScreenshotFile']);
        Route::post('/users/{user}/trigger-live', [UserController::class, 'triggerLive']);
        Route::post('/users/{user}/stop-live', [UserController::class, 'stopLive']);
        Route::post('/users/{user}/signal', [UserController::class, 'signal']);
        Route::get('/users/{user}/signal', [UserController::class, 'getSignal']);
        Route::get('/users/{user}/activity-summary', [UserController::class, 'getActivitySummary']);
    });

    // Clients
    Route::get('/clients', [ClientController::class, 'index']);
    Route::post('/clients', [ClientController::class, 'store']);
    Route::get('/clients/{client}', [ClientController::class, 'show']);
    Route::put('/clients/{client}', [ClientController::class, 'update']);
    Route::delete('/clients/{client}', [ClientController::class, 'destroy']);
    Route::get('/clients/active', [ClientController::class, 'getActiveClients']);

    // Projects
    Route::get('/projects', [ProjectController::class, 'index']);
    Route::post('/projects', [ProjectController::class, 'store']);
    Route::get('/projects/active', [ProjectController::class, 'getActiveProjects']);
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::put('/projects/{project}', [ProjectController::class, 'update']);
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
    Route::get('/clients/{client}/projects', [ProjectController::class, 'getProjectsByClient']);
    Route::get('/users/{user}/projects', [ProjectController::class, 'getProjectsByManager']);

    // Tasks
    Route::get('/tasks', [TaskController::class, 'index']);
    Route::post('/tasks', [TaskController::class, 'store']);
    Route::get('/tasks/{task}', [TaskController::class, 'show']);
    Route::put('/tasks/{task}', [TaskController::class, 'update']);
    Route::delete('/tasks/{task}', [TaskController::class, 'destroy']);
    Route::get('/projects/{project}/tasks', [TaskController::class, 'getTasksByProject']);
    Route::get('/users/{user}/tasks', [TaskController::class, 'getTasksByUser']);
    Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus']);
    Route::post('/tasks/reorder', [TaskController::class, 'reorder']);

    // Desktop App Integration
    Route::post('/desktop/time-log', [DesktopAppController::class, 'syncTimeLog']);
    Route::put('/desktop/time-log/{timeLog}', [DesktopAppController::class, 'updateTimeLog']);
    Route::post('/desktop/screenshot', [DesktopAppController::class, 'uploadScreenshot']);
    Route::post('/desktop/activity-log', [DesktopAppController::class, 'syncActivityLog']);
    Route::get('/desktop/active-projects', [DesktopAppController::class, 'getActiveProjects']);
    Route::get('/desktop/assigned-projects', [DesktopAppController::class, 'getAssignedProjects']);
    Route::get('/desktop/projects/{project}/tasks', [DesktopAppController::class, 'getProjectTasksForUser']);
    Route::get('/desktop/time-logs', [DesktopAppController::class, 'getUserTimeLogs']);
    Route::get('/desktop/screenshots', [DesktopAppController::class, 'getUserScreenshots']);
    Route::post('/desktop/batch', [DesktopAppController::class, 'submitBatch']);
});

use Illuminate\Support\Facades\Broadcast;
Broadcast::routes(['middleware' => ['auth:sanctum']]);
require __DIR__.'/channels.php';
