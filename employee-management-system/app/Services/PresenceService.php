<?php

namespace App\Services;

use App\Events\UserStatusChanged;
use App\Models\UserPresence;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use Illuminate\Support\Collection;
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
        $query = UserPresence::with(['user', 'currentProject', 'currentTask']);

        // Apply filters
        if (!empty($filters['status'])) {
            if ($filters['status'] === 'internet_issue') {
                $query->where('status', '!=', 'offline')
                      ->where('internet_connected', false);
            } else {
                $query->where('status', $filters['status']);
            }
        }
        if (!empty($filters['project_id'])) {
            $query->where('current_project_id', $filters['project_id']);
        }
        if (!empty($filters['department'])) {
            $query->whereHas('user', function ($q) use ($filters) {
                $q->where('department', $filters['department']);
            });
        }
        if (!empty($filters['search'])) {
            $query->whereHas('user', function ($q) use ($filters) {
                $q->where('name', 'like', '%' . $filters['search'] . '%');
            });
        }

        return $query->get();
    }

    /**
     * Helper to broadcast status changes.
     */
    protected function broadcastPresence(UserPresence $presence): void
    {
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
            Log::warning('Failed to broadcast user presence status: ' . $e->getMessage());
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
