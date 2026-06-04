<?php

namespace App\Http\Controllers;

use App\Events\MeetingCreated;
use App\Events\MeetingEnded;
use App\Events\MeetingStarted;
use App\Events\NewMeetingMessage;
use App\Models\Meeting;
use App\Models\MeetingMessage;
use App\Models\MeetingParticipant;
use App\Models\User;
use App\Services\NotificationService;
use App\Mail\MeetingInvitationMail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MeetingController extends Controller
{
    protected NotificationService $notificationService;

    public function __construct(NotificationService $notificationService)
    {
        $this->notificationService = $notificationService;
    }

    /**
     * List meetings (upcoming, live, completed).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        
        $meetings = Meeting::whereHas('participants', function ($query) use ($user) {
            $query->where('user_id', $user->id);
        })
        ->with(['creator:id,name', 'participants:id,name'])
        ->orderBy('scheduled_at', 'asc')
        ->get();

        // Group/categorize by status
        $upcoming = $meetings->where('status', 'scheduled')->values();
        $live = $meetings->where('status', 'live')->values();
        $completed = $meetings->where('status', 'completed')->values();
        $cancelled = $meetings->where('status', 'cancelled')->values();

        return response()->json([
            'success' => true,
            'data' => [
                'upcoming' => $upcoming,
                'live' => $live,
                'completed' => $completed,
                'cancelled' => $cancelled,
            ],
        ]);
    }

    /**
     * Store a new meeting.
     */
    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'required|in:team,one_on_one,department',
            'scheduled_at' => 'required|date',
            'duration_minutes' => 'required|integer|min:5',
            'participants' => 'required|array',
            'participants.*' => 'required|exists:users,id',
        ]);

        $user = $request->user();
        $scheduledAt = Carbon::parse($request->input('scheduled_at'));

        $meeting = Meeting::create([
            'title' => $request->input('title'),
            'description' => $request->input('description'),
            'type' => $request->input('type'),
            'status' => 'scheduled',
            'created_by' => $user->id,
            'scheduled_at' => $scheduledAt,
            'duration_minutes' => (int) $request->input('duration_minutes'),
        ]);

        // Add host
        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $user->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        // Add other participants
        $participants = array_unique($request->input('participants'));
        
        // Remove host from participants list if they added themselves
        $participants = array_filter($participants, function($id) use ($user) {
            return (int) $id !== (int) $user->id;
        });

        foreach ($participants as $participantId) {
            MeetingParticipant::create([
                'meeting_id' => $meeting->id,
                'user_id' => $participantId,
                'role' => 'participant',
                'status' => 'invited',
            ]);
        }

        // Load participants relations
        $meeting->load('participants');

        // Dispatch MeetingCreated Event
        try {
            broadcast(new MeetingCreated($meeting))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast MeetingCreated: ' . $e->getMessage());
        }

        // Notify participants in-app/Telegram/Email
        $formattedTime = $scheduledAt->format('M d, Y h:i A');
        $durationText = $meeting->duration_minutes . ' minutes';

        foreach ($meeting->participants as $participant) {
            if ($participant->id === $user->id) {
                continue;
            }

            // In-app & Telegram Notification
            $this->notificationService->sendToUser(
                $participant->id,
                'meeting_created',
                'meeting',
                'New Meeting Scheduled',
                "You have been invited to '{$meeting->title}' by {$user->name} on {$formattedTime}.",
                ['meeting_id' => $meeting->id],
                $user->id
            );

            // Send Email Invitation
            try {
                Mail::to($participant->email)->send(
                    new MeetingInvitationMail(
                        $meeting->title,
                        $meeting->description ?? '',
                        $formattedTime,
                        $durationText,
                        $user->name
                    )
                );
            } catch (\Exception $e) {
                Log::warning("Failed to send meeting invitation email to {$participant->email}: " . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Meeting created successfully.',
            'data' => $meeting->load(['creator', 'participants']),
        ], 201);
    }

    /**
     * Show meeting details.
     */
    public function show(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::with(['creator:id,name', 'participants:id,name'])->findOrFail($id);

        // Verify participant
        if (!$meeting->participants->contains('id', $user->id)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $meeting,
        ]);
    }

    /**
     * Update meeting details.
     */
    public function update(Request $request, $id): JsonResponse
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'required|in:team,one_on_one,department',
            'scheduled_at' => 'required|date',
            'duration_minutes' => 'required|integer|min:5',
            'participants' => 'required|array',
            'participants.*' => 'required|exists:users,id',
        ]);

        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $host = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->where('role', 'host')
            ->first();

        if (!$host) {
            return response()->json([
                'success' => false,
                'message' => 'Only the host can update the meeting.',
            ], 403);
        }

        $scheduledAt = Carbon::parse($request->input('scheduled_at'));

        $meeting->update([
            'title' => $request->input('title'),
            'description' => $request->input('description'),
            'type' => $request->input('type'),
            'scheduled_at' => $scheduledAt,
            'duration_minutes' => (int) $request->input('duration_minutes'),
        ]);

        // Sync participants
        $newParticipantIds = array_unique($request->input('participants'));
        $newParticipantIds = array_filter($newParticipantIds, function($id) use ($user) {
            return (int) $id !== (int) $user->id;
        });

        // Get current participant IDs
        $currentParticipantIds = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('role', 'participant')
            ->pluck('user_id')
            ->toArray();

        // Delete removed participants
        $removedIds = array_diff($currentParticipantIds, $newParticipantIds);
        MeetingParticipant::where('meeting_id', $meeting->id)
            ->whereIn('user_id', $removedIds)
            ->delete();

        // Add newly added participants
        $addedIds = array_diff($newParticipantIds, $currentParticipantIds);
        foreach ($addedIds as $participantId) {
            MeetingParticipant::create([
                'meeting_id' => $meeting->id,
                'user_id' => $participantId,
                'role' => 'participant',
                'status' => 'invited',
            ]);

            // Notify newly added
            $this->notificationService->sendToUser(
                $participantId,
                'meeting_created',
                'meeting',
                'New Meeting Invitation',
                "You have been invited to '{$meeting->title}' by {$user->name} on {$scheduledAt->format('M d, Y h:i A')}.",
                ['meeting_id' => $meeting->id],
                $user->id
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Meeting updated successfully.',
            'data' => $meeting->load(['creator', 'participants']),
        ]);
    }

    /**
     * Start the meeting (Host only).
     */
    public function start(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $host = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->where('role', 'host')
            ->first();

        if (!$host) {
            return response()->json([
                'success' => false,
                'message' => 'Only the meeting host can start the meeting.',
            ], 403);
        }

        $meeting->update([
            'status' => 'live',
            'started_at' => now(),
            'meeting_link' => '/meeting-room/' . $meeting->id,
        ]);

        $meeting->load(['creator', 'participants']);

        // Broadcast MeetingStarted Event
        try {
            broadcast(new MeetingStarted($meeting))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast MeetingStarted: ' . $e->getMessage());
        }

        // Notify other participants that meeting is live
        foreach ($meeting->participants as $participant) {
            if ($participant->id === $user->id) {
                continue;
            }

            $this->notificationService->sendToUser(
                $participant->id,
                'meeting_started',
                'meeting',
                'Meeting is Live!',
                "The meeting '{$meeting->title}' has started. Click to join now.",
                ['meeting_id' => $meeting->id, 'action' => 'join'],
                $user->id
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Meeting started successfully.',
            'data' => $meeting,
        ]);
    }

    /**
     * End the meeting (Host or Admin participant).
     */
    public function end(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $host = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->where('role', 'host')
            ->first();

        $isParticipant = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->exists();

        $canEnd = (bool) $host || ($user && $user->isAdmin() && $isParticipant);

        if (!$canEnd) {
            return response()->json([
                'success' => false,
                'message' => 'Only the meeting host or an admin participant can end the meeting.',
            ], 403);
        }

        $meeting->update([
            'status' => 'completed',
            'ended_at' => now(),
        ]);

        $meeting->load(['creator', 'participants']);

        // Broadcast MeetingEnded Event
        try {
            broadcast(new MeetingEnded($meeting));
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast MeetingEnded: ' . $e->getMessage());
        }

        // Also update participants left status who were still joined
        MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('status', 'joined')
            ->update([
                'status' => 'left',
                'left_at' => now(),
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Meeting ended successfully.',
            'data' => $meeting,
        ]);
    }

    /**
     * Join the meeting.
     */
    public function join(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $participant = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->first();

        if (!$participant) {
            return response()->json([
                'success' => false,
                'message' => 'You are not invited to this meeting.',
            ], 403);
        }

        $participant->update([
            'status' => 'joined',
            'joined_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Joined meeting.',
        ]);
    }

    /**
     * Leave the meeting.
     */
    public function leave(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $participant = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->first();

        if (!$participant) {
            return response()->json([
                'success' => false,
                'message' => 'You are not a participant in this meeting.',
            ], 403);
        }

        $participant->update([
            'status' => 'left',
            'left_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Left meeting.',
        ]);
    }

    /**
     * Respond to invitation (accept/decline).
     */
    public function respond(Request $request, $id): JsonResponse
    {
        $request->validate([
            'status' => 'required|in:accepted,declined',
        ]);

        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $participant = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->first();

        if (!$participant) {
            return response()->json([
                'success' => false,
                'message' => 'You are not a participant in this meeting.',
            ], 403);
        }

        if ($participant->role === 'host') {
            return response()->json([
                'success' => false,
                'message' => 'Hosts cannot decline their own meetings.',
            ], 422);
        }

        $participant->update([
            'status' => $request->input('status'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Response submitted.',
            'data' => $participant,
        ]);
    }

    /**
     * Get meeting chat messages.
     */
    public function messages(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        if (!$meeting->participants()->where('user_id', $user->id)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        $messages = MeetingMessage::where('meeting_id', $meeting->id)
            ->with('user:id,name')
            ->orderBy('created_at', 'asc')
            ->get();

        $formatted = $messages->map(function ($msg) {
            return [
                'id' => $msg->id,
                'meeting_id' => $msg->meeting_id,
                'user_id' => $msg->user_id,
                'user_name' => $msg->user->name,
                'message' => $msg->message,
                'created_at' => $msg->created_at->toIso8601String(),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $formatted,
        ]);
    }

    /**
     * Send message in meeting.
     */
    public function sendMessage(Request $request, $id): JsonResponse
    {
        $request->validate([
            'message' => 'required|string',
        ]);

        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        if (!$meeting->participants()->where('user_id', $user->id)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        $message = MeetingMessage::create([
            'meeting_id' => $meeting->id,
            'user_id' => $user->id,
            'message' => $request->input('message'),
        ]);

        // Broadcast the message
        try {
            broadcast(new NewMeetingMessage($message))->toOthers();
        } catch (\Exception $e) {
            Log::warning('Failed to broadcast meeting message: ' . $e->getMessage());
        }

        $formatted = [
            'id' => $message->id,
            'meeting_id' => $message->meeting_id,
            'user_id' => $message->user_id,
            'user_name' => $user->name,
            'message' => $message->message,
            'created_at' => $message->created_at->toIso8601String(),
        ];

        return response()->json([
            'success' => true,
            'data' => $formatted,
        ]);
    }

    /**
     * Cancel a meeting.
     */
    public function destroy(Request $request, $id): JsonResponse
    {
        $user = $request->user();
        $meeting = Meeting::findOrFail($id);

        $host = MeetingParticipant::where('meeting_id', $meeting->id)
            ->where('user_id', $user->id)
            ->where('role', 'host')
            ->first();

        if (!$host) {
            return response()->json([
                'success' => false,
                'message' => 'Only the host can cancel the meeting.',
            ], 403);
        }

        $meeting->update([
            'status' => 'cancelled',
        ]);

        // Notify participants
        foreach ($meeting->participants as $participant) {
            if ($participant->id === $user->id) {
                continue;
            }

            $this->notificationService->sendToUser(
                $participant->id,
                'meeting_cancelled',
                'meeting',
                'Meeting Cancelled',
                "The meeting '{$meeting->title}' has been cancelled.",
                ['meeting_id' => $meeting->id],
                $user->id
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Meeting cancelled successfully.',
        ]);
    }
}
