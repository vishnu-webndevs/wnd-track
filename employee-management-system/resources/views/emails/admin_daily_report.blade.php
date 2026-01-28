<!DOCTYPE html>
<html>
<head>
    <title>Admin Daily Team Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
        .user-section { margin-bottom: 20px; padding: 15px; border-radius: 10px; }
        .day-total { text-align: right; font-weight: bold; color: #333; margin-top: 10px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <h2 style="text-align: center; color: #333;">Team Daily Activity Report</h2>
        <p style="text-align: center; color: #666; margin-bottom: 30px;">{{ $date->format('Y-m-d') }}</p>
    
        @php
            $bgColors = ['#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#FFEBEE', '#F1F8E9', '#E0F7FA', '#FFF8E1'];
        @endphp

        @foreach($reportData as $data)
            @php
                $bgColor = $bgColors[$loop->index % count($bgColors)];
            @endphp
            <div class="user-section" style="background-color: {{ $bgColor }};">
                <!-- User Header Table -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 15px;">
                    <tr>
                        <td align="left" style="font-size: 1.2em; font-weight: bold; color: #333;">
                            {{ $data['user']->name }}
                        </td>
                        <td align="right">
                            <span style="background-color: rgba(255,255,255,0.6); padding: 4px 10px; border-radius: 12px; font-size: 0.8em; color: #333; display: inline-block; font-weight: bold;">
                                Weekly: {{ floor($data['weekly_total'] / 60) }}h {{ $data['weekly_total'] % 60 }}m
                            </span>
                        </td>
                    </tr>
                </table>
                
                @php
                    $projectDurations = [];
                    $userDayTotal = 0;
                    foreach($data['logs'] as $log) {
                        $name = $log->project->name ?? 'No Project';
                        if (!isset($projectDurations[$name])) {
                            $projectDurations[$name] = 0;
                        }
                        $projectDurations[$name] += $log->duration;
                        $userDayTotal += $log->duration;
                    }
                @endphp

                <!-- Column Headers -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 5px;">
                    <tr>
                        <td align="left" style="padding: 5px 15px; font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase;">PROJECT</td>
                        <td align="right" style="padding: 5px 15px; font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase;">TIME</td>
                    </tr>
                </table>

                <!-- Project Cards -->
                @foreach($projectDurations as $name => $duration)
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 10px;">
                        <tr>
                            <td style="background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; padding: 12px 15px;">
                                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                    <tr>
                                        <td align="left" style="font-weight: bold; color: #444; font-size: 15px;">
                                            {{ $name }}
                                        </td>
                                        <td align="right" style="white-space: nowrap;">
                                            <span style="color: #444; font-weight: 500; font-size: 14px; background: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 4px; display: inline-block;">
                                                {{ floor($duration / 60) }}h {{ $duration % 60 }}m
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                @endforeach

                <div class="day-total">
                    Day Total: {{ floor($userDayTotal / 60) }}h {{ $userDayTotal % 60 }}m
                </div>
            </div>
        @endforeach
    </div>
</body>
</html>
