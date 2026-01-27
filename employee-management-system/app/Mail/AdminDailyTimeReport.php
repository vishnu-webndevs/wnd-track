<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AdminDailyTimeReport extends Mailable
{
    use Queueable, SerializesModels;

    public $reportData;
    public $date;

    /**
     * Create a new message instance.
     * 
     * @param array $reportData Array of ['user' => User, 'logs' => Collection, 'weekly_total' => int]
     * @param \Carbon\Carbon $date
     */
    public function __construct($reportData, $date)
    {
        $this->reportData = $reportData;
        $this->date = $date;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Admin Daily Team Report - ' . $this->date->format('Y-m-d'),
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.admin_daily_report',
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [];
    }
}
