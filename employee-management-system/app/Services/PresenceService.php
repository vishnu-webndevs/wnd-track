<?php

namespace App\Services;

use App\Events\UserStatusChanged;
use App\Models\UserPresence;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class PresenceService
{
    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * Update user presence status and broadcast.
     */
    public function updatePresence(
        int $userId,
        string $status,
        ?int $projectId = null,
        ?int $taskId = null,
        bool $internetConnected = true
    ): UserPresence {
        $presence = UserPresence::where('user_id', $userId)->first();
        $oldStatus = $presence ? $presence->status : null;
        
        $trackingStartedAt = null;
        if (in_array($status, ['working', 'paused'])) {
            $trackingStartedAt = $presence ? ($presence->tracking_started_at ?? now()) : now();
        }

        $presence = UserPresence::updateOrCreate(
            ['user_id' => $userId],
            [
                'status' => $status,
                'current_project_id' => $projectId,
                'current_task_id' => $taskId,
                'tracking_started_at' => $trackingStartedAt,
                'last_activity_at' => now(),
                'internet_connected' => $internetConnected,
                'last_seen' => now(),
            ]
        );

        // Send notification if status changed
        if ($oldStatus !== $status) {
            $this->sendStatusChangeNotification($presence, $oldStatus, $status);
        }

        // Broadcast the status change
        $this->broadcastPresence($presence);

        return $presence;
    }

    /**
     * Update heartbeat / last seen.
     */
    public function heartbeat(int $userId, bool $internetConnected = true): void
    {
        $presence = UserPresence::where('user_id', $userId)->first();
        if ($presence) {
            $oldStatus = $presence->status;
            $presence->update([
                'last_seen' => now(),
                'last_activity_at' => now(),
                'internet_connected' => $internetConnected,
            ]);

            // If user was offline, set status to available
            if ($presence->status === 'offline') {
                $presence->update(['status' => 'available']);
                $this->sendStatusChangeNotification($presence, $oldStatus, 'available');
            }

            $this->broadcastPresence($presence);
        } else {
            // Create user presence if it doesn't exist
            $this->updatePresence($userId, 'available', null, null, $internetConnected);
        }
    }

    /**
     * Retrieve team presence status with filters.
     */
    public function getTeamStatus(array $filters = []): Collection
    {
        $usersQuery = User::with(['presence.currentProject', 'presence.currentTask']);

        if (!empty($filters['department'])) {
            $usersQuery->where('department', $filters['department']);
        }
        if (!empty($filters['search'])) {
            $usersQuery->where('name', 'like', '%' . $filters['search'] . '%');
        }

        $users = $usersQuery->get();

        $presences = $users->map(function ($user) {
            if ($user->presence) {
                $p = $user->presence;
                $p->setRelation('user', $user);
                return $p;
            }

            // Create a default offline presence object for users without a presence record
            $p = new UserPresence([
                'user_id' => $user->id,
                'status' => 'offline',
                'internet_connected' => false,
            ]);
            $p->setRelation('user', $user);
            $p->setRelation('currentProject', null);
            $p->setRelation('currentTask', null);
            return $p;
        });

        // Apply presence-specific filters after creating default objects
        if (!empty($filters['status'])) {
            $presences = $presences->filter(function ($p) use ($filters) {
                if ($filters['status'] === 'internet_issue') {
                    return $p->status !== 'offline' && !$p->internet_connected;
                }
                return $p->status === $filters['status'];
            });
        }

        if (!empty($filters['project_id'])) {
            $presences = $presences->filter(function ($p) use ($filters) {
                return (string) $p->current_project_id === (string) $filters['project_id'];
            });
        }

        return $presences->values();
    }

    /**
     * Helper to broadcast status changes.
     */
    protected function broadcastPresence(UserPresence $presence): void
    {
        try {
            $disabledUntil = Cache::get('broadcast:disabled_until');
            if (is_numeric($disabledUntil) && (int) $disabledUntil > time()) {
                return;
            }
        } catch (\Throwable $e) {
        }

        $presence->load(['user', 'currentProject', 'currentTask']);

        $presenceData = [
            'user_id' => $presence->user_id,
            'user_name' => $presence->user->name,
            'email' => $presence->user->email,
            'department' => $presence->user->department,
            'status' => $presence->status,
            'current_project' => $presence->currentProject ? [
                'id' => $presence->currentProject->id,
                'name' => $presence->currentProject->name,
            ] : null,
            'current_task' => $presence->currentTask ? [
                'id' => $presence->currentTask->id,
                'name' => $presence->currentTask->name,
            ] : null,
            'tracking_started_at' => $presence->tracking_started_at ? $presence->tracking_started_at->toIso8601String() : null,
            'last_activity_at' => $presence->last_activity_at ? $presence->last_activity_at->toIso8601String() : null,
            'internet_connected' => $presence->internet_connected,
            'last_seen' => $presence->last_seen ? $presence->last_seen->toIso8601String() : null,
        ];

        try {
            broadcast(new UserStatusChanged($presenceData))->toOthers();
        } catch (\Exception $e) {
            try {
                $cooldownSeconds = 300;
                $cacheKey = 'presence:broadcast_presence_failed';
                $shouldLog = Cache::add($cacheKey, true, $cooldownSeconds);
                Cache::put('broadcast:disabled_until', time() + $cooldownSeconds, $cooldownSeconds);
                if ($shouldLog) {
                    Log::warning('Failed to broadcast user presence status: ' . $e->getMessage());
                }
            } catch (\Throwable $inner) {
                Log::warning('Failed to broadcast user presence status: ' . $e->getMessage());
            }
        }
    }

    /**
     * Send notification when user status changes.
     */
    protected function sendStatusChangeNotification(UserPresence $presence, ?string $oldStatus, string $newStatus): void
    {
        $user = User::find($presence->user_id);
        if (!$user) return;

        $title = '';
        $message = '';
        $icon = '';

        switch ($newStatus) {
            case 'working':
                $title = "{$user->name} Started Tracking";
                $message = "{$user->name} has started working on a task.";
                $icon = '⏱️';
                break;
            case 'paused':
                $title = "{$user->name} Paused Tracking";
                $message = "{$user->name} has paused their time tracking.";
                $icon = '⏸️';
                break;
            case 'available':
                $title = "{$user->name} is Available";
                $message = "{$user->name} is now available for communication.";
                $icon = '🟢';
                break;
            case 'offline':
                $title = "{$user->name} Went Offline";
                $message = "{$user->name} has gone offline.";
                $icon = '⚪';
                break;
        }

        if (!empty($title)) {
            \Log::info('Sending status change notification to admins', [
                'user_id' => $user->id,
                'user_name' => $user->name,
                'old_status' => $oldStatus,
                'new_status' => $newStatus,
            ]);
            
            $this->notificationService->sendToAdmins(
                'user_status_change',
                'user',
                $title,
                $message,
                [
                    'user_id' => $presence->user_id,
                    'user_name' => $user->name,
                    'old_status' => $oldStatus,
                    'new_status' => $newStatus,
                ],
                $presence->user_id,
                $icon
            );
        }
    }
}
