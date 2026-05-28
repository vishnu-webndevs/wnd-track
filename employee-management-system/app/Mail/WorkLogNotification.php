<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WorkLogNotification extends Mailable
{
    use Queueable, SerializesModels;

    public string $employeeName;
    public string $projectName;
    public string $taskTitle;
    public string $workLog;
    public string $logType; // 'start' or 'end'
    public string $logTime;
    public ?string $duration;

    /**
     * Create a new message instance.
     */
    public function __construct(
        string $employeeName,
        string $projectName,
        string $taskTitle,
        string $workLog,
        string $logType = 'start',
        string $logTime = '',
        ?string $duration = null
    ) {
        $this->employeeName = $employeeName;
        $this->projectName = $projectName;
        $this->taskTitle = $taskTitle;
        $this->workLog = $workLog;
        $this->logType = $logType;
        $this->logTime = $logTime ?: now()->format('d M Y, h:i A');
        $this->duration = $duration;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        $typeLabel = $this->logType === 'start' ? 'Start' : 'End';
        return new Envelope(
            subject: "Work Log ({$typeLabel}) - {$this->employeeName} - {$this->projectName}",
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.work_log',
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
