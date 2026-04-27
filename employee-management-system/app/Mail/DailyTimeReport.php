<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use Carbon\Carbon;

class DailyTimeReport extends Mailable
{
    use Queueable, SerializesModels;

    public $user;
    public $logs;
    public $weeklyTotal;
    public $date;

    /**
     * Create a new message instance.
     */
    public function __construct(User $user, $logs, $weeklyTotal, $date)
    {
        $this->user = $user;
        $this->logs = $logs;
        $this->weeklyTotal = $weeklyTotal;
        $this->date = $date;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Daily Time Tracker Report - ' . Carbon::parse($this->date)->format('Y-m-d'),
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.daily_report',
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
