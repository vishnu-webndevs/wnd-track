<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Client;
use App\Models\Project;
use App\Models\Task;
use App\Models\TimeLog;
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
        $totalEmployees = User::where('role', 'employee')->count();
        $totalClients = Client::count();
        $totalProjects = Project::count();
        $totalTasks = Task::count();

        $activeProjects = Project::where('status', 'in_progress')->count();
        $completedProjects = Project::where('status', 'completed')->count();
        $pendingTasks = Task::where('status', 'pending')->count();
        $inProgressTasks = Task::where('status', 'in_progress')->count();

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
            ],
            'recent_projects' => $recentProjects,
            'recent_tasks' => $recentTasks,
            'project_status_counts' => $projectStatusCounts,
            'task_status_counts' => $taskStatusCounts,
        ]);
    }

    private function getEmployeeDashboard($user)
    {
        $assignedTasks = $user->assignedTasks()->count();
        $inProgressTasks = $user->assignedTasks()->where('status', 'in_progress')->count();
        $completedTasks = $user->assignedTasks()->where('status', 'completed')->count();
        $pendingTasks = $user->assignedTasks()->where('status', 'pending')->count();

        $totalHours = TimeLog::where('user_id', $user->id)
            ->whereNotNull('duration')
            ->sum('duration');

        $todayHours = TimeLog::where('user_id', $user->id)
            ->whereDate('start_time', Carbon::today())
            ->whereNotNull('duration')
            ->sum('duration');

        $thisWeekHours = TimeLog::where('user_id', $user->id)
            ->whereBetween('start_time', [Carbon::now()->startOfWeek(), Carbon::now()->endOfWeek()])
            ->whereNotNull('duration')
            ->sum('duration');

        $recentTasks = $user->assignedTasks()
            ->with(['project'])
            ->latest()
            ->take(5)
            ->get();

        $recentTimeLogs = TimeLog::where('user_id', $user->id)
            ->with(['project', 'task'])
            ->latest()
            ->take(5)
            ->get();

        return response()->json([
            'stats' => [
                'assigned_tasks' => $assignedTasks,
                'in_progress_tasks' => $inProgressTasks,
                'completed_tasks' => $completedTasks,
                'pending_tasks' => $pendingTasks,
                'total_hours' => round($totalHours / 60, 1), // Convert minutes to hours
                'today_hours' => round($todayHours / 60, 1),
                'this_week_hours' => round($thisWeekHours / 60, 1),
            ],
            'recent_tasks' => $recentTasks,
            'recent_time_logs' => $recentTimeLogs,
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
