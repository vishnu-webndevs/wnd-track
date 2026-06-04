<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Client;
use App\Models\Project;
use App\Models\Task;
use App\Models\TimeLog;
use App\Models\UserPresence;
use App\Models\Meeting;
use App\Models\Conversation;
use App\Models\NotificationRecipient;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth:sanctum');
    }

    public function index()
    {
        $user = auth()->user();
        
        if ($user->isAdmin()) {
            return $this->getAdminDashboard();
        } else {
            return $this->getEmployeeDashboard($user);
        }
    }

    private function getAdminDashboard()
    {
        $userId = auth()->id();
        $totalEmployees = User::where('role', 'employee')->count();
        $totalClients = Client::count();
        $totalProjects = Project::count();
        $totalTasks = Task::count();

        $activeProjects = Project::where('status', 'in_progress')->count();
        $completedProjects = Project::where('status', 'completed')->count();
        $pendingTasks = Task::where('status', 'pending')->count();
        $inProgressTasks = Task::where('status', 'in_progress')->count();

        // Presence Stats
        $onlineEmployees = UserPresence::where('status', '!=', 'offline')->count();
        $availableEmployees = UserPresence::where('status', 'available')->count();
        $activeTrackers = UserPresence::where('status', 'working')->count();
        $offlineEmployees = $totalEmployees - $onlineEmployees;

        // Meeting Stats
        $upcomingMeetingsCount = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })->where('status', 'scheduled')->count();

        $liveMeetingsCount = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })->where('status', 'live')->count();

        // Chat unread count
        $conversations = Conversation::forUser($userId)->get();
        $unreadMessages = 0;
        foreach ($conversations as $conversation) {
            $unreadMessages += $conversation->getUnreadCountFor($userId);
        }

        // Notification unread count
        $pendingNotifications = NotificationRecipient::where('user_id', $userId)
            ->where('is_read', false)
            ->count();

        $recentProjects = Project::with(['client', 'manager'])
            ->latest()
            ->take(5)
            ->get();

        $recentTasks = Task::with(['project', 'assignedTo'])
            ->latest()
            ->take(5)
            ->get();

        $projectStatusCounts = Project::selectRaw('status, count(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $taskStatusCounts = Task::selectRaw('status, count(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        // Lists for widgets
        $upcomingMeetingsList = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })
        ->where('status', 'scheduled')
        ->with(['creator:id,name', 'participants:id,name'])
        ->orderBy('scheduled_at', 'asc')
        ->take(3)
        ->get();

        $activeMeetingsList = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })
        ->where('status', 'live')
        ->with(['creator:id,name', 'participants:id,name'])
        ->orderBy('started_at', 'asc')
        ->get();

        return response()->json([
            'stats' => [
                'total_employees' => $totalEmployees,
                'total_clients' => $totalClients,
                'total_projects' => $totalProjects,
                'total_tasks' => $totalTasks,
                'active_projects' => $activeProjects,
                'completed_projects' => $completedProjects,
                'pending_tasks' => $pendingTasks,
                'in_progress_tasks' => $inProgressTasks,
                // Presence
                'online_employees' => $onlineEmployees,
                'available_employees' => $availableEmployees,
                'active_trackers' => $activeTrackers,
                'offline_employees' => $offlineEmployees,
                // Meetings
                'upcoming_meetings' => $upcomingMeetingsCount,
                'live_meetings' => $liveMeetingsCount,
                // Communication
                'unread_messages' => $unreadMessages,
                'pending_notifications' => $pendingNotifications,
            ],
            'recent_projects' => $recentProjects,
            'recent_tasks' => $recentTasks,
            'project_status_counts' => $projectStatusCounts,
            'task_status_counts' => $taskStatusCounts,
            'upcoming_meetings_list' => $upcomingMeetingsList,
            'active_meetings_list' => $activeMeetingsList,
        ]);
    }

    private function getEmployeeDashboard($user)
    {
        $userId = $user->id;
        $assignedTasks = $user->assignedTasks()->count();
        $inProgressTasks = $user->assignedTasks()->where('status', 'in_progress')->count();
        $completedTasks = $user->assignedTasks()->where('status', 'completed')->count();
        $pendingTasks = $user->assignedTasks()->where('status', 'pending')->count();

        $totalHours = TimeLog::where('user_id', $userId)
            ->whereNotNull('duration')
            ->sum('duration');

        $todayHours = TimeLog::where('user_id', $userId)
            ->whereDate('start_time', Carbon::today())
            ->whereNotNull('duration')
            ->sum('duration');

        $thisWeekHours = TimeLog::where('user_id', $userId)
            ->whereBetween('start_time', [Carbon::now()->startOfWeek(), Carbon::now()->endOfWeek()])
            ->whereNotNull('duration')
            ->sum('duration');

        // Meeting Stats
        $upcomingMeetingsCount = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })->where('status', 'scheduled')->count();

        $liveMeetingsCount = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })->where('status', 'live')->count();

        // Chat unread count
        $conversations = Conversation::forUser($userId)->get();
        $unreadMessages = 0;
        foreach ($conversations as $conversation) {
            $unreadMessages += $conversation->getUnreadCountFor($userId);
        }

        // Notification unread count
        $pendingNotifications = NotificationRecipient::where('user_id', $userId)
            ->where('is_read', false)
            ->count();

        $recentTasks = $user->assignedTasks()
            ->with(['project'])
            ->latest()
            ->take(5)
            ->get();

        $recentTimeLogs = TimeLog::where('user_id', $userId)
            ->with(['project', 'task'])
            ->orderBy('start_time', 'desc')
            ->take(5)
            ->get();

        // Lists for widgets
        $upcomingMeetingsList = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })
        ->where('status', 'scheduled')
        ->with(['creator:id,name', 'participants:id,name'])
        ->orderBy('scheduled_at', 'asc')
        ->take(3)
        ->get();

        $activeMeetingsList = Meeting::whereHas('participants', function($q) use ($userId) {
            $q->where('user_id', $userId);
        })
        ->where('status', 'live')
        ->with(['creator:id,name', 'participants:id,name'])
        ->orderBy('started_at', 'asc')
        ->get();

        return response()->json([
            'stats' => [
                'assigned_tasks' => $assignedTasks,
                'in_progress_tasks' => $inProgressTasks,
                'completed_tasks' => $completedTasks,
                'pending_tasks' => $pendingTasks,
                'total_hours' => round($totalHours / 60, 1),
                'today_hours' => round($todayHours / 60, 1),
                'today_minutes' => (int)$todayHours,
                'this_week_hours' => round($thisWeekHours / 60, 1),
                // Meetings
                'upcoming_meetings' => $upcomingMeetingsCount,
                'live_meetings' => $liveMeetingsCount,
                // Communication
                'unread_messages' => $unreadMessages,
                'pending_notifications' => $pendingNotifications,
            ],
            'recent_tasks' => $recentTasks,
            'recent_time_logs' => $recentTimeLogs,
            'upcoming_meetings_list' => $upcomingMeetingsList,
            'active_meetings_list' => $activeMeetingsList,
        ]);
    }

    public function getTimeAnalytics(Request $request)
    {
        $user = auth()->user();
        $startDate = $request->get('start_date', Carbon::now()->startOfMonth());
        $endDate = $request->get('end_date', Carbon::now()->endOfMonth());

        $query = TimeLog::whereBetween('start_time', [$startDate, $endDate])
            ->whereNotNull('duration');

        if ($user->isEmployee()) {
            $query->where('user_id', $user->id);
        }

        $dailyHours = $query->selectRaw('DATE(start_time) as date, SUM(duration) / 60 as hours')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $projectHours = $query->selectRaw('project_id, SUM(duration) / 60 as hours')
            ->groupBy('project_id')
            ->with('project')
            ->get();

        return response()->json([
            'daily_hours' => $dailyHours,
            'project_hours' => $projectHours,
        ]);
    }
}
