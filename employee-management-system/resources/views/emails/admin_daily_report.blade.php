<!DOCTYPE html>
<html>
<head>
    <title>Admin Daily Team Report</title>
    <style>
        body { font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .user-section { margin-top: 30px; border-top: 2px solid #eee; padding-top: 20px; }
        .user-header { font-size: 1.2em; font-weight: bold; color: #333; }
        .weekly-badge { background-color: #e3f2fd; padding: 2px 8px; border-radius: 10px; font-size: 0.8em; margin-left: 10px; }
    </style>
</head>
<body>
    <h2>Team Daily Activity Report - {{ $date->format('Y-m-d') }}</h2>
    <p>Summary of employee activities for today:</p>

    @foreach($reportData as $data)
        <div class="user-section">
            <div class="user-header">
                {{ $data['user']->name }}
                <span class="weekly-badge">Weekly Total: {{ floor($data['weekly_total'] / 60) }}h {{ $data['weekly_total'] % 60 }}m</span>
            </div>
            
            <table>
                <thead>
                    <tr>
                        <th>Project</th>
                        <th>Task</th>
                        <th>Duration</th>
                        <th>Description</th>
                    </tr>
                </thead>
                <tbody>
                    @php $userDayTotal = 0; @endphp
                    @foreach($data['logs'] as $log)
                        @php $userDayTotal += $log->duration; @endphp
                        <tr>
                            <td>{{ $log->project->name ?? 'N/A' }}</td>
                            <td>{{ $log->task->title ?? 'N/A' }}</td>
                            <td>{{ floor($log->duration / 60) }}h {{ $log->duration % 60 }}m</td>
                            <td>{{ $log->description }}</td>
                        </tr>
                    @endforeach
                    <tr style="background-color: #fafafa; font-weight: bold;">
                        <td colspan="2" style="text-align: right;">Day Total:</td>
                        <td colspan="2">{{ floor($userDayTotal / 60) }}h {{ $userDayTotal % 60 }}m</td>
                    </tr>
                </tbody>
            </table>
        </div>
    @endforeach
</body>
</html>
