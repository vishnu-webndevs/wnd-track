<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class MeetingInvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $meetingTitle;
    public string $meetingDescription;
    public string $scheduledAt;
    public string $duration;
    public string $organizerName;

    /**
     * Create a new message instance.
     */
    public function __construct(
        string $meetingTitle,
        string $meetingDescription,
        string $scheduledAt,
        string $duration,
        string $organizerName
    ) {
        $this->meetingTitle = $meetingTitle;
        $this->meetingDescription = $meetingDescription;
        $this->scheduledAt = $scheduledAt;
        $this->duration = $duration;
        $this->organizerName = $organizerName;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Meeting Invitation: {$this->meetingTitle}",
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            html: 'emails.meeting-invitation',
        );
    }
}
