<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\TimeLog;
use App\Models\Project;
use Illuminate\Support\Facades\Mail;
use App\Mail\DailyTimeReport;
use App\Mail\AdminDailyTimeReport;
use Carbon\Carbon;

class SendDailyTimeReport extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'report:daily-time';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send daily time tracking reports to employees, admins, and project managers';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $today = Carbon::today();
        $startOfWeek = Carbon::now()->startOfWeek();

        // 1. Get all users
        $users = User::all();
        
        $adminReportData = [];
        $pmReportData = []; // Key: PM User ID, Value: Array of report data

        foreach ($users as $user) {
            // Get today's logs for this user
            $todayLogs = TimeLog::where('user_id', $user->id)
                ->whereDate('start_time', $today)
                ->with(['project', 'task'])
                ->get();

            if ($todayLogs->isEmpty()) {
                continue;
            }

            // Calculate weekly total duration (minutes)
            $weeklyTotal = TimeLog::where('user_id', $user->id)
                ->where('start_time', '>=', $startOfWeek)
                ->where('start_time', '<=', Carbon::now())
                ->sum('duration');

            // Send Email to Employee
            try {
                Mail::to($user->email)->send(new DailyTimeReport($user, $todayLogs, $weeklyTotal));
                $this->info("Report sent to employee: {$user->email}");
            } catch (\Exception $e) {
                $this->error("Failed to send to {$user->email}: " . $e->getMessage());
            }

            // Prepare Admin Data (All logs)
            $adminReportData[] = [
                'user' => $user,
                'logs' => $todayLogs,
                'weekly_total' => $weeklyTotal
            ];

            // Prepare Project Manager Data
            // Group logs by project manager
            foreach ($todayLogs as $log) {
                $project = $log->project;
                if ($project && $project->manager_id) {
                    $pmId = $project->manager_id;
                    
                    // Initialize PM bucket if not exists
                    if (!isset($pmReportData[$pmId])) {
                        $pmReportData[$pmId] = [];
                    }
                    
                    // We need to structure this so PM sees User -> Logs
                    // Check if we already have an entry for this user for this PM
                    if (!isset($pmReportData[$pmId][$user->id])) {
                        $pmReportData[$pmId][$user->id] = [
                            'user' => $user,
                            'logs' => collect([]), // Start with empty collection
                            'weekly_total' => $weeklyTotal // Note: This is user's TOTAL weekly time, not just for this PM. 
                                                          // User asked for "weekly total time jo daily change hoga". 
                                                          // Usually implies total work. I will keep it as total work.
                        ];
                    }
                    
                    // Add this specific log to the PM's view for this user
                    $pmReportData[$pmId][$user->id]['logs']->push($log);
                }
            }
        }

        // 2. Send Admin Report
        $admins = User::where('role', 'admin')->get();
        foreach ($admins as $admin) {
            try {
                if (!empty($adminReportData)) {
                    Mail::to($admin->email)->send(new AdminDailyTimeReport($adminReportData, $today));
                    $this->info("Report sent to admin: {$admin->email}");
                }
            } catch (\Exception $e) {
                $this->error("Failed to send to admin {$admin->email}: " . $e->getMessage());
            }
        }

        // 3. Send Project Manager Reports
        foreach ($pmReportData as $pmId => $usersData) {
            $pm = User::find($pmId);
            if ($pm) {
                // Convert associative array to indexed array for the view
                $reportData = array_values($usersData);
                
                try {
                    Mail::to($pm->email)->send(new AdminDailyTimeReport($reportData, $today));
                    $this->info("Report sent to PM: {$pm->email}");
                } catch (\Exception $e) {
                    $this->error("Failed to send to PM {$pm->email}: " . $e->getMessage());
                }
            }
        }

        $this->info('Daily reports processed.');
    }
}
