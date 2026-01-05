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

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group. Make something great!
|
*/
Route::get('/up', function () {
    return response()->json(['status' => 'ok']);
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
    Route::get('/users/{user}/time-logs', [UserController::class, 'getTimeLogs']);
    Route::get('/users/{user}/screenshots', [UserController::class, 'getScreenshots']);
    Route::post('/users/{user}/trigger-live', [UserController::class, 'triggerLive']);
    Route::post('/users/{user}/stop-live', [UserController::class, 'stopLive']);
    Route::post('/users/{user}/signal', [UserController::class, 'signal']);
    Route::get('/users/{user}/signal', [UserController::class, 'getSignal']);
    Route::get('/users/{user}/activity-summary', [UserController::class, 'getActivitySummary']);

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
    Route::get('/projects/{project}', [ProjectController::class, 'show']);
    Route::put('/projects/{project}', [ProjectController::class, 'update']);
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy']);
    Route::get('/projects/active', [ProjectController::class, 'getActiveProjects']);
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
