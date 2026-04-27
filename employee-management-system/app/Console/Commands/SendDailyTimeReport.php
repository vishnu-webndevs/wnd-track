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
    protected $signature = 'report:daily-time {date?}';

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
        $dateInput = $this->argument('date');

        try {
            $today = $dateInput 
                ? Carbon::parse($dateInput)->startOfDay()
                : Carbon::today();
        } catch (\Exception $e) {
            $this->error('Invalid date format. Use YYYY-MM-DD');
            return;
        }

        $startOfWeek = $today->copy()->startOfWeek();

        // 1. Get all users
        $users = User::all();
        
        $adminReportData = [];
        $pmReportData = [];

        foreach ($users as $user) {

            // Get selected day's logs
            $todayLogs = TimeLog::where('user_id', $user->id)
                ->whereDate('start_time', $today)
                ->with(['project', 'task'])
                ->get();

            if ($todayLogs->isEmpty()) {
                continue;
            }

            // Weekly total (based on selected date)
            $weeklyTotal = TimeLog::where('user_id', $user->id)
                ->where('start_time', '>=', $startOfWeek)
                ->where('start_time', '<=', $today->copy()->endOfDay())
                ->sum('duration');

            // Send Email to Employee
            if ($user->status === 'active') {
                try {
                    Mail::to($user->email)->send(
                        new DailyTimeReport($user, $todayLogs, $weeklyTotal, $today)
                    );
                    $this->info("Report sent to employee: {$user->email}");
                } catch (\Exception $e) {
                    $this->error("Failed to send to {$user->email}: " . $e->getMessage());
                }
            }

            // Admin data
            $adminReportData[] = [
                'user' => $user,
                'logs' => $todayLogs,
                'weekly_total' => $weeklyTotal
            ];

            // PM data
            foreach ($todayLogs as $log) {
                $project = $log->project;

                if ($project && $project->manager_id) {
                    $pmId = $project->manager_id;

                    if (!isset($pmReportData[$pmId])) {
                        $pmReportData[$pmId] = [];
                    }

                    if (!isset($pmReportData[$pmId][$user->id])) {
                        $pmReportData[$pmId][$user->id] = [
                            'user' => $user,
                            'logs' => collect([]),
                            'weekly_total' => $weeklyTotal
                        ];
                    }

                    $pmReportData[$pmId][$user->id]['logs']->push($log);
                }
            }
        }

        // 2. Send Admin Report
        $admins = User::where('role', 'admin')
            ->where('status', 'active')
            ->get();

        foreach ($admins as $admin) {
            try {
                if (!empty($adminReportData)) {
                    Mail::to($admin->email)->send(
                        new AdminDailyTimeReport($adminReportData, $today)
                    );
                    $this->info("Report sent to admin: {$admin->email}");
                }
            } catch (\Exception $e) {
                $this->error("Failed to send to admin {$admin->email}: " . $e->getMessage());
            }
        }

        // 3. Send PM Reports
        foreach ($pmReportData as $pmId => $usersData) {
            $pm = User::find($pmId);

            if ($pm && $pm->status === 'active') {

                if ($pm->role === 'admin') {
                    $this->info("Skipping PM report for {$pm->email} (already admin).");
                    continue;
                }

                $reportData = array_values($usersData);

                try {
                    Mail::to($pm->email)->send(
                        new AdminDailyTimeReport($reportData, $today)
                    );
                    $this->info("Report sent to PM: {$pm->email}");
                } catch (\Exception $e) {
                    $this->error("Failed to send to PM {$pm->email}: " . $e->getMessage());
                }
            }
        }

        $this->info('Daily reports processed.');
    }
}