<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Daily Work Log Summary</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .header p { margin: 8px 0 0; opacity: 0.9; font-size: 14px; }
        .content { padding: 24px; }
        .summary { background: #f0f0ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center; }
        .summary .total { font-size: 28px; font-weight: bold; color: #4f46e5; }
        .summary .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
        .log-item { border-left: 3px solid #4f46e5; padding: 12px 16px; margin-bottom: 12px; background: #fafafa; border-radius: 0 6px 6px 0; }
        .log-item .project { font-weight: 600; color: #333; }
        .log-item .task { font-size: 13px; color: #666; }
        .log-item .time { font-size: 12px; color: #999; margin-top: 4px; }
        .footer { text-align: center; padding: 16px; font-size: 12px; color: #999; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📋 Daily Work Log Summary</h1>
            <p>{{ $employeeName }} • {{ $date }}</p>
        </div>
        <div class="content">
            <div class="summary">
                <div class="label">Total Work Duration</div>
                <div class="total">{{ $totalDuration }}</div>
            </div>
            @foreach($logs as $log)
            <div class="log-item">
                <div class="project">{{ $log['project'] }}</div>
                <div class="task">{{ $log['task'] }}</div>
                <div class="time">{{ $log['start_time'] }} - {{ $log['end_time'] }} ({{ $log['duration'] }})</div>
                @if(!empty($log['description']))
                <div class="task" style="margin-top:6px;">{{ $log['description'] }}</div>
                @endif
            </div>
            @endforeach
        </div>
        <div class="footer">
            WND Tracker • Automated Work Log Summary
        </div>
    </div>
</body>
</html>
