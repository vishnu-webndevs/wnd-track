<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Meeting Invitation</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .meeting-details { background: #f0f0ff; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .detail-row { display: flex; margin-bottom: 12px; }
        .detail-row:last-child { margin-bottom: 0; }
        .detail-icon { width: 24px; text-align: center; margin-right: 12px; }
        .detail-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        .detail-value { font-weight: 600; color: #333; }
        .description { padding: 16px; background: #fafafa; border-radius: 6px; margin-bottom: 20px; color: #555; line-height: 1.6; }
        .footer { text-align: center; padding: 16px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📅 Meeting Invitation</h1>
            <p>You've been invited to a meeting</p>
        </div>
        <div class="content">
            <div class="meeting-details">
                <div class="detail-row">
                    <div class="detail-icon">📌</div>
                    <div>
                        <div class="detail-label">Meeting</div>
                        <div class="detail-value">{{ $meetingTitle }}</div>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-icon">👤</div>
                    <div>
                        <div class="detail-label">Organized by</div>
                        <div class="detail-value">{{ $organizerName }}</div>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-icon">📅</div>
                    <div>
                        <div class="detail-label">Date & Time</div>
                        <div class="detail-value">{{ $scheduledAt }}</div>
                    </div>
                </div>
                <div class="detail-row">
                    <div class="detail-icon">⏱️</div>
                    <div>
                        <div class="detail-label">Duration</div>
                        <div class="detail-value">{{ $duration }}</div>
                    </div>
                </div>
            </div>

            @if($meetingDescription)
            <div class="description">
                <strong>Description:</strong><br>
                {{ $meetingDescription }}
            </div>
            @endif
        </div>
        <div class="footer">
            WND Tracker • Meeting Management
        </div>
    </div>
</body>
</html>
