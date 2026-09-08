<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\TimeLog;
use App\Models\Setting;
use App\Mail\UserInactivityAlertMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class CheckInactivityAlerts extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:check-inactivity-alerts {--force : Force run regardless of scheduled time and day}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check for active users inactive for N consecutive working days and send email alerts';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $enabled = Setting::get('inactivity_alert_enabled', 1);
        if (!$enabled && !$this->option('force')) {
            $this->info('Inactivity email alerts are disabled in settings.');
            return 0;
        }

        $force = $this->option('force');

        // Saturday and Sunday are strictly excluded
        if (!$force && (now()->isSaturday() || now()->isSunday())) {
            $this->info('Today is a weekend. Inactivity check skipped.');
            return 0;
        }

        // Check scheduled time (e.g., 15:00 or 11:00)
        $scheduledTime = Setting::get('inactivity_alert_time', '15:00');
        $formattedScheduledTime = date('H:i', strtotime($scheduledTime));
        $currentTime = now()->format('H:i');

        if (!$force && $currentTime < $formattedScheduledTime) {
            $this->info("Current time ({$currentTime}) is before configured alert time ({$formattedScheduledTime}). Skipped.");
            return 0;
        }

        $consecutiveDaysNeeded = (int) Setting::get('inactivity_alert_days', 2);
        if ($consecutiveDaysNeeded < 1) {
            $consecutiveDaysNeeded = 1;
        }

        // Collect the last N working days (excluding Sat & Sun) starting from today going backwards
        $recentWorkingDays = [];
        $cursor = Carbon::today();
        while (count($recentWorkingDays) < $consecutiveDaysNeeded) {
            if (!$cursor->isSaturday() && !$cursor->isSunday()) {
                $recentWorkingDays[] = $cursor->format('Y-m-d');
            }
            $cursor->subDay();
        }

        // Get ONLY active users (Users who have NOT left job / status = 'active')
        $users = User::where('status', 'active')
            ->whereIn('role', ['employee', 'project_manager', 'admin'])
            ->get();

        $alertsSentCount = 0;

        foreach ($users as $user) {
            // Additional safety check: skip if status is not active
            if ($user->status !== 'active') {
                continue;
            }

            // Check if user has ANY tracked time in the required N working days window
            $hasTrackedInWindow = TimeLog::where('user_id', $user->id)
                ->whereIn(DB::raw('DATE(start_time)'), $recentWorkingDays)
                ->where('duration', '>', 0)
                ->exists();

            // If user has tracked time during these working days, they are active -> skip!
            if ($hasTrackedInWindow) {
                continue;
            }

            // User is inactive for at least N working days!
            // Calculate total consecutive inactive working days count for display
            $lastLog = TimeLog::where('user_id', $user->id)
                ->where('duration', '>', 0)
                ->orderBy('start_time', 'desc')
                ->first();

            $userInactiveDays = 0;
            $userInactiveDates = [];
            $checkCursor = Carbon::today();

            if ($lastLog && $lastLog->start_time) {
                $lastTrackedDate = Carbon::parse($lastLog->start_time)->startOfDay();
            } else {
                $lastTrackedDate = Carbon::parse($user->created_at)->startOfDay();
            }

            while ($checkCursor->greaterThan($lastTrackedDate)) {
                if (!$checkCursor->isSaturday() && !$checkCursor->isSunday()) {
                    $userInactiveDays++;
                    $userInactiveDates[] = $checkCursor->format('Y-m-d');
                }
                $checkCursor->subDay();

                // Cap maximum count at 30 days for clean email display
                if ($userInactiveDays >= 30) {
                    break;
                }
            }

            if ($userInactiveDays < $consecutiveDaysNeeded) {
                $userInactiveDays = $consecutiveDaysNeeded;
            }

            $cacheKey = 'inactivity_alert_sent_' . $user->id . '_' . Carbon::today()->format('Y-m-d');
            if (!$force && Cache::has($cacheKey)) {
                $this->info("Alert already sent today for {$user->name} ({$user->email}). Skipped.");
                continue;
            }

            $this->warn("User {$user->name} (Role: {$user->role}) is inactive for {$userInactiveDays} consecutive working days!");

            // 1. Send alert to the user themself (Only if active)
            try {
                Mail::to($user->email)->queue(new UserInactivityAlertMail(
                    $user,
                    'self',
                    $userInactiveDays,
                    $userInactiveDates
                ));
                $this->info("Email queued for user: {$user->email}");
            } catch (\Exception $e) {
                $this->error("Failed queueing email to {$user->email}: " . $e->getMessage());
            }

            // 2. Recipients for Admin and Project Manager notifications (Only ACTIVE admins & managers)
            $managementRecipients = [];

            if ($user->role === 'employee') {
                $assignedManagerIds = $user->assignedProjects()->pluck('manager_id')->filter()->unique()->toArray();
                $pmEmails = User::whereIn('id', $assignedManagerIds)->where('status', 'active')->pluck('email')->toArray();
                $allPmEmails = User::where('role', 'project_manager')->where('status', 'active')->pluck('email')->toArray();
                $pmEmails = array_values(array_unique(array_merge($pmEmails, $allPmEmails)));

                $adminEmails = User::where('role', 'admin')->where('status', 'active')->pluck('email')->toArray();
                $managementRecipients = array_values(array_unique(array_merge($pmEmails, $adminEmails)));
            } elseif ($user->role === 'project_manager') {
                $adminEmails = User::where('role', 'admin')->where('status', 'active')->pluck('email')->toArray();
                $managementRecipients = array_values(array_unique($adminEmails));
            } elseif ($user->role === 'admin') {
                $otherAdminEmails = User::where('role', 'admin')
                    ->where('status', 'active')
                    ->where('id', '!=', $user->id)
                    ->pluck('email')
                    ->toArray();
                $managementRecipients = array_values(array_unique($otherAdminEmails));
            }

            // Filter out user's own email from management recipients list to avoid duplicate email to self
            $managementRecipients = array_values(array_filter($managementRecipients, function ($email) use ($user) {
                return strtolower($email) !== strtolower($user->email);
            }));

            if (!empty($managementRecipients)) {
                try {
                    Mail::to($managementRecipients)->queue(new UserInactivityAlertMail(
                        $user,
                        $user->role === 'employee' ? 'manager' : 'admin',
                        $userInactiveDays,
                        $userInactiveDates
                    ));
                    $this->info("Email queued for management: " . implode(', ', $managementRecipients));
                } catch (\Exception $e) {
                    $this->error("Failed queueing management emails: " . $e->getMessage());
                }
            }

            // Mark alert as sent for today
            Cache::put($cacheKey, true, now()->addHours(24));
            $alertsSentCount++;
        }

        $this->info("Completed inactivity check. Total alerts sent: {$alertsSentCount}");
        return 0;
    }
}
