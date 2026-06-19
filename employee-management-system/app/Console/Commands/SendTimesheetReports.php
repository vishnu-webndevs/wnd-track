<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\TimeLog;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Mail;
use App\Mail\TimesheetReportMail;
use Carbon\Carbon;

class SendTimesheetReports extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:send-timesheet-reports {--period=month : The period to generate the report for (week or month)}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Generate and email timesheet PDF reports to users';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $period = $this->option('period');
        
        if ($period === 'week') {
            $startDate = Carbon::now()->startOfWeek()->format('Y-m-d');
            $endDate = Carbon::now()->endOfWeek()->format('Y-m-d');
            $periodLabel = 'Weekly';
        } else {
            $startDate = Carbon::now()->startOfMonth()->format('Y-m-d');
            $endDate = Carbon::now()->endOfMonth()->format('Y-m-d');
            $periodLabel = 'Monthly';
        }

        $this->info("Starting $periodLabel Timesheet Report Generation ($startDate to $endDate)...");

        // 1. Send to Admins and Project Managers (All active users' data)
        $admins = User::whereIn('role', ['admin', 'project_manager'])->where('status', 'active')->get();
        if ($admins->count() > 0) {
            $this->info("Gathering data for Admins...");
            $allLogs = TimeLog::with(['user', 'project', 'task'])
                ->whereBetween('start_time', [$startDate . ' 00:00:00', $endDate . ' 23:59:59'])
                ->orderBy('start_time', 'desc')
                ->get();

            $pdf = Pdf::loadView('pdf.timesheet', [
                'logs' => $allLogs,
                'periodLabel' => $periodLabel,
                'startDate' => $startDate,
                'endDate' => $endDate,
                'isAdminReport' => true,
                'user' => null
            ])->setPaper('a4', 'landscape');

            $pdfContent = $pdf->output();

            foreach ($admins as $admin) {
                Mail::to($admin->email)->send(new TimesheetReportMail($pdfContent, "{$periodLabel} Timesheet Report (All Employees)", "timesheet_all_employees_{$startDate}_to_{$endDate}.pdf", $admin, $periodLabel, $startDate, $endDate));
                $this->info("Sent to Admin: {$admin->email}");
            }
        }

        // 2. Send to Employees (Only their own data, exclude project_manager and admin)
        $employees = User::whereIn('role', ['employee'])->where('status', 'active')->get();
        foreach ($employees as $employee) {
            $logs = TimeLog::with(['project', 'task'])
                ->where('user_id', $employee->id)
                ->whereBetween('start_time', [$startDate . ' 00:00:00', $endDate . ' 23:59:59'])
                ->orderBy('start_time', 'desc')
                ->get();

            if ($logs->count() > 0) {
                $pdf = Pdf::loadView('pdf.timesheet', [
                    'logs' => $logs,
                    'periodLabel' => $periodLabel,
                    'startDate' => $startDate,
                    'endDate' => $endDate,
                    'isAdminReport' => false,
                    'user' => $employee
                ])->setPaper('a4', 'landscape');

                $pdfContent = $pdf->output();

                Mail::to($employee->email)->send(new TimesheetReportMail($pdfContent, "Your {$periodLabel} Timesheet Report", "timesheet_{$employee->name}_{$startDate}_to_{$endDate}.pdf", $employee, $periodLabel, $startDate, $endDate));
                $this->info("Sent to Employee: {$employee->email}");
            } else {
                $this->info("Skipped Employee: {$employee->email} (No logs)");
            }
        }

        $this->info("Timesheet reports sent successfully.");
    }
}
