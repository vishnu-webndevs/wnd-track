<?php

use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

// Default user channel
Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Private notification channel - only the recipient can listen
Broadcast::channel('notifications.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Private conversation channel - only participants can listen
Broadcast::channel('conversation.{conversationId}', function ($user, $conversationId) {
    return \App\Models\Conversation::find($conversationId)?->isParticipant($user->id) ?? false;
});

// Presence channel for team availability - all authenticated users
Broadcast::channel('team-presence', function ($user) {
    if ($user) {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'role' => $user->role,
        ];
    }
    return false;
});

// Private voice signaling channel
Broadcast::channel('voice.{sessionId}', function ($user, $sessionId) {
    return $user !== null;
});

// Private meeting channel
Broadcast::channel('meeting.{meetingId}', function ($user, $meetingId) {
    return \App\Models\Meeting::find($meetingId)?->participants()->where('user_id', $user->id)->exists() ?? false;
});

// Presence meeting channel
Broadcast::channel('presence-meeting.{meetingId}', function ($user, $meetingId) {
    $meeting = \App\Models\Meeting::find($meetingId);
    if ($meeting && $meeting->participants()->where('users.id', $user->id)->exists()) {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'role' => $user->role,
        ];
    }
    return false;
});
