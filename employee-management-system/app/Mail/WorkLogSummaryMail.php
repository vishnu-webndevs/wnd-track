<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WorkLogSummaryMail extends Mailable
{
    use Queueable, SerializesModels;

    public string $employeeName;
    public string $date;
    public array $logs;
    public string $totalDuration;

    /**
     * Create a new message instance.
     */
    public function __construct(string $employeeName, string $date, array $logs, string $totalDuration)
    {
        $this->employeeName = $employeeName;
        $this->date = $date;
        $this->logs = $logs;
        $this->totalDuration = $totalDuration;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Daily Work Log Summary - {$this->date}",
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            html: 'emails.work-log-summary',
        );
    }
}
