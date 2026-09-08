<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Illuminate\Contracts\Queue\ShouldQueue;

class UserInactivityAlertMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public $user;
    public $recipientRole;
    public $consecutiveDays;
    public $inactiveDates;

    /**
     * Create a new message instance.
     */
    public function __construct(User $user, string $recipientRole, int $consecutiveDays, array $inactiveDates)
    {
        $this->user = $user;
        $this->recipientRole = $recipientRole; // 'self', 'manager', 'admin'
        $this->consecutiveDays = $consecutiveDays;
        $this->inactiveDates = $inactiveDates;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        $roleTitle = ucfirst(str_replace('_', ' ', $this->user->role));
        
        if ($this->recipientRole === 'self') {
            $subject = "Inactivity Alert: You haven't tracked time for the last {$this->consecutiveDays} working days";
        } else {
            $subject = "Inactivity Alert: {$roleTitle} '{$this->user->name}' is inactive for the last {$this->consecutiveDays} working days";
        }

        return new Envelope(
            subject: $subject,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.inactivity_alert',
        );
    }

    /**
     * Get the attachments for the message.
     */
    public function attachments(): array
    {
        return [];
    }
}
