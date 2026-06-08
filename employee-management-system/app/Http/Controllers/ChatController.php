<?php

namespace App\Http\Controllers;

use App\Events\NewChatMessage;
use App\Events\MessageRead;
use App\Events\UserTyping;
use App\Events\ConversationDeleted;
use App\Events\GroupParticipantAdded;
use App\Events\GroupParticipantRemoved;
use App\Events\ChatCleared;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\MessageRead as MessageReadModel;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ChatController extends Controller
{
    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * List all conversations for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $conversations = Conversation::forUser($userId)
            ->with([
                'latestMessage.sender:id,name',
                'participants.user:id,name,role,department,position',
                'participants.user.presence',
            ])
            ->orderBy('last_message_at', 'desc')
            ->get();

        // Format and append unread count
        $data = $conversations->map(function ($conversation) use ($userId) {
            $unreadCount = $conversation->getUnreadCountFor($userId);
            
            // Format participants to exclude the current user if direct chat
            $otherParticipants = $conversation->participants
                ->filter(fn($p) => $p->user_id !== $userId)
                ->map(fn($p) => [
                    'id' => $p->user->id,
                    'name' => $p->user->name,
                    'role' => $p->user->role,
                    'department' => $p->user->department,
                    'position' => $p->user->position,
                    'status' => $p->user->presence?->status ?? 'offline',
                    'internet_connected' => $p->user->presence?->internet_connected ?? false,
                    'last_seen' => $p->user->presence?->last_seen ? $p->user->presence->last_seen->toIso8601String() : null,
                ])
                ->values();

            return [
                'id' => $conversation->id,
                'type' => $conversation->type,
                'name' => $conversation->type === 'group' ? $conversation->name : ($otherParticipants->first()['name'] ?? 'Chat'),
                'created_by' => $conversation->created_by,
                'last_message_at' => $conversation->last_message_at ? $conversation->last_message_at->toIso8601String() : null,
                'unread_count' => $unreadCount,
                'latest_message' => $conversation->latestMessage ? [
                    'id' => $conversation->latestMessage->id,
                    'body' => $conversation->latestMessage->body,
                    'sender_id' => $conversation->latestMessage->sender_id,
                    'sender_name' => $conversation->latestMessage->sender?->name ?? 'System',
                    'created_at' => $conversation->latestMessage->created_at->toIso8601String(),
                ] : null,
                'participants' => $otherParticipants,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    /**
     * Create or retrieve a conversation.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'required|in:direct,group',
            'recipient_id' => 'required_if:type,direct|exists:users,id',
            'name' => 'required_if:type,group|string|max:255',
            'participant_ids' => 'required_if:type,group|array',
            'participant_ids.*' => 'exists:users,id',
        ]);

        $userId = $request->user()->id;
        $type = $request->input('type');

        if ($type === 'direct') {
            $recipientId = (int) $request->input('recipient_id');

            if ($userId === $recipientId) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cannot start a chat with yourself.',
                ], 422);
            }

            // Check if direct conversation already exists
            $conversation = Conversation::where('type', 'direct')
                ->whereHas('participants', function ($q) use ($userId) {
                    $q->where('user_id', $userId);
                })
                ->whereHas('participants', function ($q) use ($recipientId) {
                    $q->where('user_id', $recipientId);
                })
                ->first();

            if ($conversation) {
                return response()->json([
                    'success' => true,
                    'conversation_id' => $conversation->id,
                ]);
            }

            // Create new direct conversation
            $conversation = DB::transaction(function () use ($userId, $recipientId) {
                $conv = Conversation::create([
                    'type' => 'direct',
                    'created_by' => $userId,
                    'last_message_at' => now(),
                ]);

                ConversationParticipant::create([
                    'conversation_id' => $conv->id,
                    'user_id' => $userId,
                    'role' => 'member',
                    'last_read_at' => now(),
                ]);

                ConversationParticipant::create([
                    'conversation_id' => $conv->id,
                    'user_id' => $recipientId,
                    'role' => 'member',
                    'last_read_at' => null,
                ]);

                return $conv;
            });

            return response()->json([
                'success' => true,
                'conversation_id' => $conversation->id,
            ], 201);
        } else {
            // Group Chat creation
            $name = $request->input('name');
            $participantIds = array_unique(array_merge([$userId], $request->input('participant_ids')));

            $conversation = DB::transaction(function () use ($userId, $name, $participantIds) {
                $conv = Conversation::create([
                    'type' => 'group',
                    'name' => $name,
                    'created_by' => $userId,
                    'last_message_at' => now(),
                ]);

                foreach ($participantIds as $pId) {
                    ConversationParticipant::create([
                        'conversation_id' => $conv->id,
                        'user_id' => $pId,
                        'role' => (int) $pId === $userId ? 'admin' : 'member',
                        'last_read_at' => (int) $pId === $userId ? now() : null,
                    ]);
                }

                // Add system message
                Message::create([
                    'conversation_id' => $conv->id,
                    'sender_id' => $userId,
                    'body' => "Group chat created.",
                    'type' => 'system',
                ]);

                return $conv;
            });

            return response()->json([
                'success' => true,
                'conversation_id' => $conversation->id,
            ], 201);
        }
    }

    /**
     * Get paginated messages in a conversation and mark as read.
     */
    public function messages(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;
        $conversation = Conversation::find($id);

        if (!$conversation || !$conversation->isParticipant($userId)) {
            return response()->json([
                'success' => false,
                'message' => 'Conversation not found or unauthorized.',
            ], 403);
        }

        $messages = Message::where('conversation_id', $id)
            ->with('sender:id,name')
            ->orderBy('created_at', 'desc')
            ->paginate($request->input('per_page', 50));

        // Mark as read asynchronously/synchronously
        $this->markConversationAsRead($conversation, $userId);

        return response()->json([
            'success' => true,
            'data' => array_reverse($messages->items()),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page' => $messages->lastPage(),
                'per_page' => $messages->perPage(),
                'total' => $messages->total(),
            ],
        ]);
    }

    /**
     * Send a message in a conversation.
     */
    public function sendMessage(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'body' => 'required|string',
        ]);

        $userId = $request->user()->id;
        $userName = $request->user()->name;
        $conversation = Conversation::find($id);

        if (!$conversation || !$conversation->isParticipant($userId)) {
            return response()->json([
                'success' => false,
                'message' => 'Conversation not found or unauthorized.',
            ], 403);
        }

        $message = DB::transaction(function () use ($conversation, $userId, $request) {
            $msg = Message::create([
                'conversation_id' => $conversation->id,
                'sender_id' => $userId,
                'body' => $request->input('body'),
                'type' => 'text',
            ]);

            $conversation->update([
                'last_message_at' => now(),
            ]);

            // Update sender's last read status
            ConversationParticipant::where('conversation_id', $conversation->id)
                ->where('user_id', $userId)
                ->update(['last_read_at' => now()]);

            return $msg;
        });

        // Broadcast to websocket
        try {
            broadcast(new NewChatMessage($message))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast new chat message: ' . $e->getMessage());
        }

        // Send notifications to other participants
        $otherParticipants = ConversationParticipant::where('conversation_id', $id)
            ->where('user_id', '!=', $userId)
            ->with('user.presence')
            ->get();

        foreach ($otherParticipants as $participant) {
            try {
                $convName = $conversation->type === 'group' ? $conversation->name : 'Direct Message';
                $this->notificationService->sendToUser(
                    $participant->user_id,
                    'chat_message',
                    'communication',
                    "New message from {$userName}",
                    "{$userName} sent you a message: " . substr($message->body, 0, 50) . (strlen($message->body) > 50 ? '...' : ''),
                    [
                        'conversation_id' => $conversation->id,
                        'sender_id' => $userId,
                        'sender_name' => $userName,
                        'type' => $conversation->type,
                    ],
                    $userId,
                    '💬'
                );
            } catch (\Exception $e) {
                Log::warning('Failed to send notification for chat message: ' . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $message->id,
                'conversation_id' => $message->conversation_id,
                'sender_id' => $message->sender_id,
                'sender_name' => $userName,
                'body' => $message->body,
                'type' => $message->type,
                'created_at' => $message->created_at->toIso8601String(),
            ],
        ]);
    }

    /**
     * Mark conversation as read explicitly.
     */
    public function markRead(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;
        $conversation = Conversation::find($id);

        if (!$conversation || !$conversation->isParticipant($userId)) {
            return response()->json([
                'success' => false,
                'message' => 'Conversation not found or unauthorized.',
            ], 403);
        }

        $this->markConversationAsRead($conversation, $userId);

        return response()->json([
            'success' => true,
            'message' => 'Conversation marked as read.',
        ]);
    }

    /**
     * Get total unread messages count.
     */
    public function totalUnread(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $conversations = Conversation::forUser($userId)->get();
        $total = 0;
        foreach ($conversations as $conversation) {
            $total += $conversation->getUnreadCountFor($userId);
        }

        return response()->json([
            'success' => true,
            'count' => $total,
        ]);
    }

    /**
     * Trigger typing whisper broadcast.
     */
    public function typing(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'is_typing' => 'required|boolean',
        ]);

        $userId = $request->user()->id;
        $userName = $request->user()->name;
        $conversation = Conversation::find($id);

        if (!$conversation || !$conversation->isParticipant($userId)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        try {
            broadcast(new UserTyping($id, $userId, $userName, $request->input('is_typing')))->toOthers();
        } catch (\Exception $e) {
            // ignore broadcast fail for whisper
        }

        return response()->json([
            'success' => true,
        ]);
    }

    /**
     * Internal helper to handle marking messages as read.
     */
    protected function markConversationAsRead(Conversation $conversation, int $userId): void
    {
        $now = now();

        ConversationParticipant::where('conversation_id', $conversation->id)
            ->where('user_id', $userId)
            ->update(['last_read_at' => $now]);

        // Find unread messages from others and mark them as read in message_reads
        $unreadMessages = Message::where('conversation_id', $conversation->id)
            ->where('sender_id', '!=', $userId)
            ->whereDoesntHave('reads', function ($q) use ($userId) {
                $q->where('user_id', $userId);
            })
            ->get();

        if ($unreadMessages->isNotEmpty()) {
            foreach ($unreadMessages as $message) {
                MessageReadModel::updateOrCreate(
                    [
                        'message_id' => $message->id,
                        'user_id' => $userId,
                    ],
                    [
                        'read_at' => $now,
                    ]
                );
            }

            // Broadcast read receipts to conversation
            try {
                broadcast(new MessageRead($conversation->id, $userId, $now->toIso8601String()))->toOthers();
            } catch (\Exception $e) {
                Log::warning('Failed to broadcast message read receipt: ' . $e->getMessage());
            }
        }

        // Mark related notifications as read
        $unreadNotifications = \App\Models\Notification::whereHas('recipientRecords', function ($q) use ($userId) {
                $q->where('user_id', $userId)->where('is_read', false);
            })
            ->where('type', 'chat_message')
            ->where('data->conversation_id', $conversation->id)
            ->get();

        foreach ($unreadNotifications as $notification) {
            $notification->recipientRecords()
                ->where('user_id', $userId)
                ->update([
                    'is_read' => true,
                    'read_at' => $now,
                ]);
        }
    }

    /**
     * Delete a conversation. Only admins can delete.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $conversation = Conversation::find($id);
        if (!$conversation) {
            return response()->json(['success' => false, 'message' => 'Conversation not found'], 404);
        }

        $participantIds = $conversation->participants()->pluck('user_id')->toArray();

        // Broadcast deleted event BEFORE we delete the records
        try {
            broadcast(new ConversationDeleted($id, $participantIds));
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast ConversationDeleted: ' . $e->getMessage());
        }

        DB::transaction(function () use ($conversation) {
            // Delete messages and their read receipts
            $messageIds = $conversation->messages()->pluck('id')->toArray();
            MessageReadModel::whereIn('message_id', $messageIds)->delete();
            $conversation->messages()->delete();

            // Delete participants
            $conversation->participants()->delete();

            // Delete conversation
            $conversation->delete();
        });

        return response()->json(['success' => true, 'message' => 'Conversation deleted']);
    }

    /**
     * Clear all messages in a conversation. Only admins can do this.
     */
    public function clearMessages(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $conversation = Conversation::find($id);
        if (!$conversation) {
            return response()->json(['success' => false, 'message' => 'Conversation not found'], 404);
        }

        DB::transaction(function () use ($conversation) {
            $messageIds = $conversation->messages()->pluck('id')->toArray();
            MessageReadModel::whereIn('message_id', $messageIds)->delete();
            $conversation->messages()->delete();
        });

        try {
            broadcast(new ChatCleared($id));
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast ChatCleared: ' . $e->getMessage());
        }

        return response()->json(['success' => true, 'message' => 'Chat history cleared']);
    }

    /**
     * Add participants to a group conversation.
     */
    public function addParticipant(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'exists:users,id'
        ]);

        $conversation = Conversation::find($id);
        if (!$conversation || $conversation->type !== 'group') {
            return response()->json(['success' => false, 'message' => 'Group conversation not found'], 404);
        }

        $userIds = $request->input('user_ids');
        $addedUsers = [];

        DB::transaction(function () use ($conversation, $userIds, $user, &$addedUsers) {
            foreach ($userIds as $userId) {
                // Check if already participant
                if (!$conversation->isParticipant($userId)) {
                    ConversationParticipant::create([
                        'conversation_id' => $conversation->id,
                        'user_id' => $userId,
                        'role' => 'member',
                        'last_read_at' => null,
                    ]);

                    $addedUser = User::find($userId);
                    if ($addedUser) {
                        $addedUsers[] = [
                            'id' => $addedUser->id,
                            'name' => $addedUser->name,
                            'role' => $addedUser->role,
                            'department' => $addedUser->department,
                            'position' => $addedUser->position,
                            'status' => $addedUser->presence?->status ?? 'offline',
                            'internet_connected' => $addedUser->presence?->internet_connected ?? false,
                            'last_seen' => $addedUser->presence?->last_seen ? $addedUser->presence->last_seen->toIso8601String() : null,
                        ];

                        // Add System Message
                        $msg = Message::create([
                            'conversation_id' => $conversation->id,
                            'sender_id' => $user->id,
                            'body' => "{$user->name} added {$addedUser->name} to the group.",
                            'type' => 'system',
                        ]);
                        
                        $conversation->update(['last_message_at' => now()]);
                        
                        try {
                            broadcast(new NewChatMessage($msg))->toOthers();
                        } catch (\Exception $e) {
                            Log::warning('Failed to broadcast system message: ' . $e->getMessage());
                        }
                    }
                }
            }
        });

        if (!empty($addedUsers)) {
            try {
                broadcast(new GroupParticipantAdded($id, $addedUsers));
            } catch (\Exception $e) {
                Log::warning('Failed to broadcast GroupParticipantAdded: ' . $e->getMessage());
            }
        }

        return response()->json(['success' => true, 'added' => $addedUsers]);
    }

    /**
     * Remove a participant from a group conversation.
     */
    public function removeParticipant(Request $request, int $id, int $userId): JsonResponse
    {
        $user = $request->user();
        if ($user->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $conversation = Conversation::find($id);
        if (!$conversation || $conversation->type !== 'group') {
            return response()->json(['success' => false, 'message' => 'Group conversation not found'], 404);
        }

        if (!$conversation->isParticipant($userId)) {
            return response()->json(['success' => false, 'message' => 'User is not a participant'], 404);
        }

        DB::transaction(function () use ($conversation, $userId, $user) {
            $removedUser = User::find($userId);
            
            ConversationParticipant::where('conversation_id', $conversation->id)
                ->where('user_id', $userId)
                ->delete();

            if ($removedUser) {
                // Add System Message
                $msg = Message::create([
                    'conversation_id' => $conversation->id,
                    'sender_id' => $user->id,
                    'body' => "{$user->name} removed {$removedUser->name} from the group.",
                    'type' => 'system',
                ]);
                
                $conversation->update(['last_message_at' => now()]);
                
                try {
                    broadcast(new NewChatMessage($msg))->toOthers();
                } catch (\Exception $e) {
                    Log::warning('Failed to broadcast system message: ' . $e->getMessage());
                }
            }
        });

        try {
            broadcast(new GroupParticipantRemoved($id, $userId));
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast GroupParticipantRemoved: ' . $e->getMessage());
        }

        return response()->json(['success' => true, 'message' => 'User removed from group']);
    }
}
