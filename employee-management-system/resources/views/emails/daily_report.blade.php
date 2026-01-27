<!DOCTYPE html>
<html>
<head>
    <title>Daily Time Report</title>
    <style>
        body { font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .total { font-weight: bold; margin-top: 20px; }
        .weekly-total { background-color: #e8f5e9; padding: 10px; margin-top: 20px; border-radius: 5px; }
    </style>
</head>
<body>
    <h2>Daily Time Report - {{ now()->format('Y-m-d') }}</h2>
    <p>Hello {{ $user->name }},</p>
    <p>Here is your time log summary for today:</p>

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
            @php $dayTotal = 0; @endphp
            @foreach($logs as $log)
                @php $dayTotal += $log->duration; @endphp
                <tr>
                    <td>{{ $log->project->name ?? 'N/A' }}</td>
                    <td>{{ $log->task->title ?? 'N/A' }}</td>
                    <td>
                        {{ floor($log->duration / 60) }}h {{ $log->duration % 60 }}m
                    </td>
                    <td>{{ $log->description }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="total">
        Today's Total: {{ floor($dayTotal / 60) }}h {{ $dayTotal % 60 }}m
    </div>

    <div class="weekly-total">
        <h3>Weekly Cumulative Total</h3>
        <p>Current Week Total (Mon-Today): <strong>{{ floor($weeklyTotal / 60) }}h {{ $weeklyTotal % 60 }}m</strong></p>
    </div>
</body>
</html>
