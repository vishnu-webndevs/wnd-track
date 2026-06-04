<?php

namespace Tests\Feature;

use App\Models\Meeting;
use App\Models\MeetingMessage;
use App\Models\MeetingParticipant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class MeetingTest extends TestCase
{
    use RefreshDatabase;

    protected User $host;
    protected User $participant;
    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->host = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->participant = User::factory()->create([
            'role' => 'employee',
            'status' => 'active',
        ]);
    }

    /**
     * Test meeting scheduling.
     */
    public function test_user_can_schedule_meeting(): void
    {
        $payload = [
            'title' => 'Weekly Sync',
            'description' => 'Discuss project status',
            'type' => 'team',
            'scheduled_at' => Carbon::now()->addDay()->toIso8601String(),
            'duration_minutes' => 45,
            'participants' => [$this->participant->id],
        ];

        $response = $this->actingAs($this->host, 'sanctum')
            ->postJson('/api/meetings', $payload);

        $response->assertStatus(201);
        $response->assertJsonPath('success', true);

        $this->assertDatabaseHas('meetings', [
            'title' => 'Weekly Sync',
            'type' => 'team',
            'created_by' => $this->host->id,
        ]);

        $this->assertDatabaseHas('meeting_participants', [
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        $this->assertDatabaseHas('meeting_participants', [
            'user_id' => $this->participant->id,
            'role' => 'participant',
            'status' => 'invited',
        ]);
    }

    /**
     * Test listing meetings.
     */
    public function test_user_can_list_meetings(): void
    {
        $meeting = Meeting::create([
            'title' => 'Review Meeting',
            'type' => 'one_on_one',
            'status' => 'scheduled',
            'created_by' => $this->host->id,
            'scheduled_at' => Carbon::now()->addHours(2),
            'duration_minutes' => 30,
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'role' => 'participant',
            'status' => 'invited',
        ]);

        $response = $this->actingAs($this->participant, 'sanctum')
            ->getJson('/api/meetings');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data.upcoming');
    }

    /**
     * Test responding to invitation.
     */
    public function test_user_can_respond_to_invitation(): void
    {
        $meeting = Meeting::create([
            'title' => 'Quick Discussion',
            'type' => 'one_on_one',
            'status' => 'scheduled',
            'created_by' => $this->host->id,
            'scheduled_at' => Carbon::now()->addHours(1),
            'duration_minutes' => 15,
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        $participantPivot = MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'role' => 'participant',
            'status' => 'invited',
        ]);

        $response = $this->actingAs($this->participant, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/respond", [
                'status' => 'accepted',
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('meeting_participants', [
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'status' => 'accepted',
        ]);
    }

    /**
     * Test starting a meeting.
     */
    public function test_host_can_start_meeting(): void
    {
        $meeting = Meeting::create([
            'title' => 'Project Kickoff',
            'type' => 'team',
            'status' => 'scheduled',
            'created_by' => $this->host->id,
            'scheduled_at' => Carbon::now(),
            'duration_minutes' => 60,
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'role' => 'participant',
            'status' => 'accepted',
        ]);

        $response = $this->actingAs($this->host, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/start");

        $response->assertStatus(200);
        $this->assertDatabaseHas('meetings', [
            'id' => $meeting->id,
            'status' => 'live',
        ]);
    }

    /**
     * Test joining/leaving meeting.
     */
    public function test_user_can_join_and_leave_meeting(): void
    {
        $meeting = Meeting::create([
            'title' => 'Sprint Planning',
            'type' => 'team',
            'status' => 'live',
            'created_by' => $this->host->id,
            'scheduled_at' => Carbon::now()->subMinutes(5),
            'duration_minutes' => 30,
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'role' => 'participant',
            'status' => 'accepted',
        ]);

        // Join
        $response = $this->actingAs($this->participant, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/join");
        $response->assertStatus(200);

        $this->assertDatabaseHas('meeting_participants', [
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'status' => 'joined',
        ]);

        // Leave
        $response = $this->actingAs($this->participant, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/leave");
        $response->assertStatus(200);

        $this->assertDatabaseHas('meeting_participants', [
            'meeting_id' => $meeting->id,
            'user_id' => $this->participant->id,
            'status' => 'left',
        ]);
    }

    public function test_admin_participant_can_end_meeting_even_if_employee_is_host(): void
    {
        $employeeHost = User::factory()->create([
            'role' => 'employee',
            'status' => 'active',
        ]);

        $meeting = Meeting::create([
            'title' => 'Team Huddle',
            'type' => 'team',
            'status' => 'live',
            'created_by' => $employeeHost->id,
            'scheduled_at' => Carbon::now()->subMinutes(2),
            'duration_minutes' => 30,
            'started_at' => Carbon::now()->subMinutes(1),
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $employeeHost->id,
            'role' => 'host',
            'status' => 'joined',
            'joined_at' => Carbon::now()->subMinute(),
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->admin->id,
            'role' => 'participant',
            'status' => 'joined',
            'joined_at' => Carbon::now()->subMinute(),
        ]);

        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/end");

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);

        $this->assertDatabaseHas('meetings', [
            'id' => $meeting->id,
            'status' => 'completed',
        ]);
    }

    /**
     * Test sending message in meeting chat.
     */
    public function test_user_can_send_meeting_message(): void
    {
        $meeting = Meeting::create([
            'title' => 'Status Check',
            'type' => 'team',
            'status' => 'live',
            'created_by' => $this->host->id,
            'scheduled_at' => Carbon::now(),
            'duration_minutes' => 30,
        ]);

        MeetingParticipant::create([
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'role' => 'host',
            'status' => 'accepted',
        ]);

        $response = $this->actingAs($this->host, 'sanctum')
            ->postJson("/api/meetings/{$meeting->id}/messages", [
                'message' => 'Hello team!',
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('meeting_messages', [
            'meeting_id' => $meeting->id,
            'user_id' => $this->host->id,
            'message' => 'Hello team!',
        ]);
    }
}
