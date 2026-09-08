<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\User;
use App\Models\TimeLog;
use App\Models\Setting;
use App\Mail\UserInactivityAlertMail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Cache;
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
    protected $description = 'Check for users inactive for N or more consecutive working days and send email alerts';

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

        // Get all active users
        $users = User::where('status', 'active')
            ->whereIn('role', ['employee', 'project_manager', 'admin'])
            ->get();

        $alertsSentCount = 0;

        foreach ($users as $user) {
            // Count total consecutive inactive working days going back from today (excluding Saturday & Sunday)
            $cursor = Carbon::today();
            $userInactiveDays = 0;
            $userInactiveDates = [];

            while (true) {
                if (!$cursor->isSaturday() && !$cursor->isSunday()) {
                    $trackedSeconds = TimeLog::where('user_id', $user->id)
                        ->whereDate('start_time', $cursor->format('Y-m-d'))
                        ->sum('duration');

                    if ($trackedSeconds > 0) {
                        // User tracked time on this working day, stop counting
                        break;
                    }

                    $userInactiveDays++;
                    $userInactiveDates[] = $cursor->format('Y-m-d');
                }

                $cursor = $cursor->copy()->subDay();

                // Safety guard to avoid infinite loop (limit max 365 days)
                if (Carbon::today()->diffInDays($cursor) > 365) {
                    break;
                }
            }

            // Only trigger if inactive working days reaches or exceeds configured threshold
            if ($userInactiveDays >= $consecutiveDaysNeeded) {
                $cacheKey = 'inactivity_alert_sent_' . $user->id . '_' . Carbon::today()->format('Y-m-d');
                if (!$force && Cache::has($cacheKey)) {
                    $this->info("Alert already sent today for {$user->name} ({$user->email}). Skipped.");
                    continue;
                }

                $this->warn("User {$user->name} (Role: {$user->role}) is inactive for {$userInactiveDays} consecutive working days!");

                // 1. Send alert to the user themself
                try {
                    Mail::to($user->email)->send(new UserInactivityAlertMail(
                        $user,
                        'self',
                        $userInactiveDays,
                        $userInactiveDates
                    ));
                    $this->info("Email sent to user: {$user->email}");
                } catch (\Exception $e) {
                    $this->error("Failed sending email to {$user->email}: " . $e->getMessage());
                }

                // 2. Recipients for Admin and Project Manager notifications
                $managementRecipients = [];

                if ($user->role === 'employee') {
                    // Send to project managers of user's assigned projects + all project managers
                    $assignedManagerIds = $user->assignedProjects()->pluck('manager_id')->filter()->unique()->toArray();
                    $pmEmails = User::whereIn('id', $assignedManagerIds)->pluck('email')->toArray();
                    $allPmEmails = User::where('role', 'project_manager')->pluck('email')->toArray();
                    $pmEmails = array_values(array_unique(array_merge($pmEmails, $allPmEmails)));

                    // Send to all Admins
                    $adminEmails = User::where('role', 'admin')->pluck('email')->toArray();

                    $managementRecipients = array_values(array_unique(array_merge($pmEmails, $adminEmails)));
                } elseif ($user->role === 'project_manager') {
                    // Send to all Admins
                    $adminEmails = User::where('role', 'admin')->pluck('email')->toArray();
                    $managementRecipients = array_values(array_unique($adminEmails));
                } elseif ($user->role === 'admin') {
                    // Send to other Admins
                    $otherAdminEmails = User::where('role', 'admin')
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
                        Mail::to($managementRecipients)->send(new UserInactivityAlertMail(
                            $user,
                            $user->role === 'employee' ? 'manager' : 'admin',
                            $userInactiveDays,
                            $userInactiveDates
                        ));
                        $this->info("Email sent to management: " . implode(', ', $managementRecipients));
                    } catch (\Exception $e) {
                        $this->error("Failed sending management emails: " . $e->getMessage());
                    }
                }

                // Mark alert as sent for today
                Cache::put($cacheKey, true, now()->addHours(24));
                $alertsSentCount++;
            }
        }

        $this->info("Completed inactivity check. Total alerts sent: {$alertsSentCount}");
        return 0;
    }
}
