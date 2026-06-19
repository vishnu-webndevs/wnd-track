<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Timesheet Report</title>
    <style>
        body {
            font-family: 'Helvetica', Arial, sans-serif;
            color: #1f2937;
            font-size: 12px;
            margin: 0;
            padding: 10px;
        }
        table { border-collapse: collapse; }
        .header-table { width: 100%; border-bottom: 3px solid #4f46e5; margin-bottom: 20px; padding-bottom: 15px; }
        .header-left h1 { font-size: 26px; color: #3730a3; margin: 0 0 5px 0; }
        .header-left .subtitle { color: #6b7280; font-size: 13px; }
        .header-right { text-align: right; vertical-align: top; }
        .header-right .company { font-size: 20px; font-weight: bold; color: #111827; margin-bottom: 4px; }
        .header-right .period { color: #6b7280; font-size: 13px; }

        .summary-table { width: 100%; margin-bottom: 25px; table-layout: fixed; }
        .summary-td { padding: 0 5px; }
        .summary-card { padding: 15px; border-radius: 8px; }
        .summary-card .label { font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; }
        .summary-card .value { font-size: 24px; font-weight: bold; }

        .card-primary { background-color: #eef2ff; }
        .card-primary .label { color: #6366f1; }
        .card-primary .value { color: #3730a3; }

        .card-emerald { background-color: #ecfdf5; }
        .card-emerald .label { color: #059669; }
        .card-emerald .value { color: #065f46; }

        .card-amber { background-color: #fffbeb; }
        .card-amber .label { color: #d97706; }
        .card-amber .value { color: #92400e; }

        .card-rose { background-color: #fff1f2; }
        .card-rose .label { color: #e11d48; }
        .card-rose .value { color: #9f1239; }

        .data-table { width: 100%; border: 1px solid #e5e7eb; border-collapse: collapse; }
        .data-table th { background-color: #1f2937; color: #fff; font-size: 11px; text-transform: uppercase; text-align: left; padding: 12px; }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 12px; vertical-align: top; }
        
        .date-header td { background-color: #eef2ff; font-weight: bold; color: #3730a3; border-bottom: 1px solid #e5e7eb; padding: 8px 12px; }
        
        .duration-cell { color: #059669; font-weight: bold; }
        .badge-manual { background-color: #fef3c7; color: #d97706; font-size: 10px; font-weight: bold; padding: 3px 6px; border-radius: 4px; text-transform: uppercase; }

        .footer { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 11px; color: #9ca3af; text-align: right; }
    </style>
</head>
<body>
    @php
        $totalLogs = count($logs);
        $totalMins = collect($logs)->sum('duration');
        $totalHours = floor($totalMins / 60);
        $remMins = $totalMins % 60;
        
        $projectSet = collect($logs)->pluck('project_id')->filter()->unique()->count();
        
        $daysWorked = collect($logs)->map(function($log) {
            return \Carbon\Carbon::parse($log->start_time)->format('Y-m-d');
        })->unique()->count();

        $groupedLogs = collect($logs)->groupBy(function($log) use ($isAdminReport) {
            $date = \Carbon\Carbon::parse($log->start_time)->format('M d, Y');
            return $isAdminReport ? $date . ' - ' . ($log->user->name ?? 'Unknown') : $date;
        });
    @endphp

    <table class="header-table">
        <tr>
            <td class="header-left">
                <h1>{{ $periodLabel }} Timesheet Report</h1>
                <div class="subtitle">
                    @if($isAdminReport)
                        All Employees
                    @else
                        Employee: <strong>{{ $user->name }}</strong>
                    @endif
                </div>
            </td>
            <td class="header-right">
                <div class="company">WND Tracker</div>
                <div class="period">{{ \Carbon\Carbon::parse($startDate)->format('M d, Y') }} — {{ \Carbon\Carbon::parse($endDate)->format('M d, Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="summary-table">
        <tr>
            <td class="summary-td">
                <div class="summary-card card-primary">
                    <div class="label">Total Hours</div>
                    <div class="value">{{ $totalHours }}h {{ $remMins }}m</div>
                </div>
            </td>
            <td class="summary-td">
                <div class="summary-card card-emerald">
                    <div class="label">Time Entries</div>
                    <div class="value">{{ $totalLogs }}</div>
                </div>
            </td>
            <td class="summary-td">
                <div class="summary-card card-amber">
                    <div class="label">Projects</div>
                    <div class="value">{{ $projectSet }}</div>
                </div>
            </td>
            <td class="summary-td">
                <div class="summary-card card-rose">
                    <div class="label">Days Worked</div>
                    <div class="value">{{ $daysWorked }}</div>
                </div>
            </td>
        </tr>
    </table>

    <table class="data-table">
        <thead>
            <tr>
                @if($isAdminReport)
                <th>Employee Name</th>
                @endif
                <th>Project</th>
                <th>Task</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Total Hours</th>
                <th>Description</th>
                <th>Manual</th>
            </tr>
        </thead>
        <tbody>
            @forelse($groupedLogs as $groupKey => $dailyLogs)
                @php
                    $dailyMins = $dailyLogs->sum('duration');
                    $dailyHours = floor($dailyMins / 60);
                    $dailyRemMins = $dailyMins % 60;
                @endphp
                <tr class="date-header">
                    <td colspan="{{ $isAdminReport ? 8 : 7 }}">
                        <table style="width: 100%;">
                            <tr>
                                <td>{{ $groupKey }}</td>
                                <td style="text-align: right; color: #4f46e5;">{{ $dailyHours }}h {{ $dailyRemMins }}m</td>
                            </tr>
                        </table>
                    </td>
                </tr>
                @foreach($dailyLogs as $log)
                @php
                    $dur = $log->duration ?? 0;
                    $h = floor($dur / 60);
                    $m = $dur % 60;
                    $formattedDur = $dur > 0 ? "{$h}h {$m}m" : '-';
                @endphp
                <tr>
                    @if($isAdminReport)
                    <td>{{ $log->user->name ?? '-' }}</td>
                    @endif
                    <td>{{ $log->project->name ?? '-' }}</td>
                    <td>{{ $log->task->title ?? '-' }}</td>
                    <td>{{ \Carbon\Carbon::parse($log->start_time)->format('h:i A') }}</td>
                    <td>{{ $log->end_time ? \Carbon\Carbon::parse($log->end_time)->format('h:i A') : 'In Progress' }}</td>
                    <td class="duration-cell">{{ $formattedDur }}</td>
                    <td>{{ $log->description }}</td>
                    <td>
                        @if($log->is_manual)
                            <span class="badge-manual">Yes</span>
                        @else
                            -
                        @endif
                    </td>
                </tr>
                @endforeach
            @empty
            <tr>
                <td colspan="{{ $isAdminReport ? 8 : 7 }}" style="text-align: center; padding: 20px;">No time logs found for this period.</td>
            </tr>
            @endforelse

            @if($totalLogs > 0)
                <tr style="background-color: #1f2937; color: #fff;">
                    <td colspan="{{ $isAdminReport ? 5 : 4 }}" style="text-align: right; padding: 12px; font-weight: bold;">GRAND TOTAL:</td>
                    <td style="padding: 12px; font-weight: bold;">{{ $totalHours }}h {{ $remMins }}m</td>
                    <td colspan="2"></td>
                </tr>
            @endif
        </tbody>
    </table>

    <div class="footer">
        Generated on {{ \Carbon\Carbon::now()->format('M d, Y h:i A') }} &nbsp;|&nbsp; WND Tracker — Timesheet Management
    </div>
</body>
</html>
