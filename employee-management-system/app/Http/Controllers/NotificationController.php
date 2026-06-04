<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\NotificationRecipient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * List notifications for the authenticated user (paginated).
     */
    public function index(Request $request): JsonResponse
    {
        $query = Notification::forUser($request->user()->id)
            ->with(['sender:id,name'])
            ->orderBy('created_at', 'desc');

        // Filter by category
        if ($request->has('category') && $request->category !== 'all') {
            $query->byCategory($request->category);
        }

        // Filter by read status
        if ($request->has('is_read')) {
            $isRead = filter_var($request->is_read, FILTER_VALIDATE_BOOLEAN);
            $query->whereHas('recipientRecords', function ($q) use ($request, $isRead) {
                $q->where('user_id', $request->user()->id)
                  ->where('is_read', $isRead);
            });
        }

        // Search
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('message', 'like', "%{$search}%");
            });
        }

        $notifications = $query->paginate($request->get('per_page', 20));

        // Attach read status for current user
        $userId = $request->user()->id;
        $notificationIds = $notifications->pluck('id');
        $readStatuses = NotificationRecipient::where('user_id', $userId)
            ->whereIn('notification_id', $notificationIds)
            ->pluck('is_read', 'notification_id');

        $notifications->getCollection()->transform(function ($notification) use ($readStatuses) {
            $notification->is_read = $readStatuses[$notification->id] ?? false;
            return $notification;
        });

        return response()->json([
            'success' => true,
            'data' => $notifications->items(),
            'meta' => [
                'current_page' => $notifications->currentPage(),
                'last_page' => $notifications->lastPage(),
                'per_page' => $notifications->perPage(),
                'total' => $notifications->total(),
            ],
        ]);
    }

    /**
     * Get unread notification count.
     */
    public function unreadCount(Request $request): JsonResponse
    {
        $count = NotificationRecipient::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'success' => true,
            'count' => $count,
        ]);
    }

    /**
     * Mark a single notification as read.
     */
    public function markRead(Request $request, int $id): JsonResponse
    {
        $recipient = NotificationRecipient::where('notification_id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if (!$recipient) {
            return response()->json([
                'success' => false,
                'message' => 'Notification not found.',
            ], 404);
        }

        $recipient->markAsRead();

        return response()->json([
            'success' => true,
            'message' => 'Notification marked as read.',
        ]);
    }

    /**
     * Mark all notifications as read.
     */
    public function markAllRead(Request $request): JsonResponse
    {
        NotificationRecipient::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => 'All notifications marked as read.',
        ]);
    }

    /**
     * Get notification preferences for the authenticated user.
     */
    public function getPreferences(Request $request): JsonResponse
    {
        $preferences = NotificationPreference::getForUser($request->user()->id);

        return response()->json([
            'success' => true,
            'data' => $preferences,
        ]);
    }

    /**
     * Update notification preferences for the authenticated user.
     */
    public function updatePreferences(Request $request): JsonResponse
    {
        $request->validate([
            'preferences' => 'required|array',
            'preferences.*.in_app' => 'boolean',
            'preferences.*.desktop' => 'boolean',
            'preferences.*.telegram' => 'boolean',
            'preferences.*.email' => 'boolean',
        ]);

        $validCategories = array_keys(NotificationPreference::getDefaults());

        foreach ($request->preferences as $category => $prefs) {
            if (!in_array($category, $validCategories)) {
                continue;
            }

            NotificationPreference::updateOrCreate(
                [
                    'user_id' => $request->user()->id,
                    'category' => $category,
                ],
                [
                    'in_app' => $prefs['in_app'] ?? true,
                    'desktop' => $prefs['desktop'] ?? true,
                    'telegram' => $prefs['telegram'] ?? false,
                    'email' => $prefs['email'] ?? false,
                ]
            );
        }

        $preferences = NotificationPreference::getForUser($request->user()->id);

        return response()->json([
            'success' => true,
            'message' => 'Preferences updated.',
            'data' => $preferences,
        ]);
    }

    /**
     * Log a client-side notification event in the database.
     */
    public function logClientEvent(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'required|string',
            'category' => 'required|string',
            'title' => 'required|string',
            'message' => 'required|string',
            'data' => 'nullable|array',
            'icon' => 'nullable|string',
        ]);

        $notificationService = app(\App\Services\NotificationService::class);
        $notification = $notificationService->sendToUser(
            $request->user()->id,
            $request->input('type'),
            $request->input('category'),
            $request->input('title'),
            $request->input('message'),
            $request->input('data', []),
            $request->user()->id,
            $request->input('icon')
        );

        return response()->json([
            'success' => true,
            'data' => $notification,
        ], 201);
    }

    /**
     * Broadcast a custom message/announcement to selected users or all users.
     */
    public function broadcast(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'message' => 'required|string',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $message = $request->input('message');
        $userIds = $request->input('user_ids', []);

        $notificationService = app(\App\Services\NotificationService::class);

        if (empty($userIds)) {
            $notification = $notificationService->sendToAll(
                'broadcast',
                'communication',
                '📢 Announcement from Admin',
                $message,
                ['admin_name' => $request->user()->name],
                $request->user()->id,
                '📢'
            );
        } else {
            $notification = $notificationService->send(
                'broadcast',
                'communication',
                '📢 Announcement from Admin',
                $message,
                ['admin_name' => $request->user()->name],
                $request->user()->id,
                $userIds,
                '📢'
            );
        }

        return response()->json([
            'success' => true,
            'data' => $notification,
        ], 201);
    }
}
