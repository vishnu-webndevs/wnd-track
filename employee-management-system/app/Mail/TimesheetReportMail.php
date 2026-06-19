<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Queue\SerializesModels;

class TimesheetReportMail extends Mailable
{
    use Queueable, SerializesModels;

    public $pdfContent;
    public $subjectLine;
    public $fileName;
    public $user;
    public $periodLabel;
    public $startDate;
    public $endDate;

    /**
     * Create a new message instance.
     */
    public function __construct($pdfContent, $subjectLine, $fileName, $user, $periodLabel, $startDate, $endDate)
    {
        $this->pdfContent = $pdfContent;
        $this->subjectLine = $subjectLine;
        $this->fileName = $fileName;
        $this->user = $user;
        $this->periodLabel = $periodLabel;
        $this->startDate = $startDate;
        $this->endDate = $endDate;
    }

    /**
     * Get the message envelope.
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->subjectLine,
        );
    }

    /**
     * Get the message content definition.
     */
    public function content(): Content
    {
        return new Content(
            view: 'emails.timesheet_report',
            with: [
                'user' => $this->user,
                'periodLabel' => $this->periodLabel,
                'startDate' => $this->startDate,
                'endDate' => $this->endDate,
            ]
        );
    }

    /**
     * Get the attachments for the message.
     *
     * @return array<int, \Illuminate\Mail\Mailables\Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(fn () => $this->pdfContent, $this->fileName)
                    ->withMime('application/pdf'),
        ];
    }
}
