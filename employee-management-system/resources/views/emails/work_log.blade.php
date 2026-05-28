<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Work Log Notification</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
            padding: 24px 32px;
            color: #fff;
        }
        .header.start {
            background: linear-gradient(135deg, #10b981, #059669);
        }
        .header.end {
            background: linear-gradient(135deg, #ef4444, #dc2626);
        }
        .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
        }
        .header p {
            margin: 4px 0 0;
            font-size: 14px;
            opacity: 0.9;
        }
        .body {
            padding: 24px 32px;
        }
        .info-row {
            display: flex;
            padding: 10px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .info-label {
            font-weight: 600;
            color: #6b7280;
            min-width: 100px;
            font-size: 14px;
        }
        .info-value {
            color: #111827;
            font-size: 14px;
        }
        .work-log-section {
            margin-top: 20px;
            padding: 16px;
            background-color: #f9fafb;
            border-radius: 6px;
            border-left: 4px solid #6366f1;
        }
        .work-log-section h3 {
            margin: 0 0 8px;
            font-size: 14px;
            color: #6366f1;
            font-weight: 600;
        }
        .work-log-section p {
            margin: 0;
            font-size: 14px;
            line-height: 1.6;
            color: #374151;
            white-space: pre-wrap;
        }
        .footer {
            padding: 16px 32px;
            background-color: #f9fafb;
            text-align: center;
            font-size: 12px;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header {{ $logType }}">
            <h1>{{ $logType === 'start' ? '🟢 Start Work Log' : '🔴 End Work Log' }}</h1>
            <p>{{ $logTime }}</p>
        </div>

        <div class="body">
            <div class="info-row">
                <span class="info-label">Employee</span>
                <span class="info-value">{{ $employeeName }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Project</span>
                <span class="info-value">{{ $projectName }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Task</span>
                <span class="info-value">{{ $taskTitle }}</span>
            </div>
            @if($duration)
            <div class="info-row">
                <span class="info-label">Duration</span>
                <span class="info-value">{{ $duration }}</span>
            </div>
            @endif

            <div class="work-log-section">
                <h3>{{ $logType === 'start' ? 'What they plan to work on' : 'What they accomplished' }}</h3>
                <p>{{ $workLog }}</p>
            </div>
        </div>

        <div class="footer">
            <p>This is an automated notification from {{ config('app.name') }} Tracker</p>
        </div>
    </div>
</body>
</html>
