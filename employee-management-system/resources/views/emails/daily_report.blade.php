<!DOCTYPE html>
<html>
<head>
    <title>Daily Time Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9f9f9; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
        .user-section { margin-bottom: 20px; padding: 20px; border-radius: 10px; background-color: #E3F2FD; }
        .total { font-weight: bold; margin-top: 15px; text-align: right; font-size: 16px; color: #333; }
        .weekly-total { background-color: rgba(255,255,255,0.6); padding: 15px; margin-top: 20px; border-radius: 8px; text-align: center; border: 1px solid rgba(0,0,0,0.05); }
        h2 { color: #333; margin-bottom: 20px; text-align: center; }
        p { color: #555; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <h2>Daily Time Report</h2>
        <p>Hello {{ $user->name }},</p>
        <p>Here is your time summary for today ({{ now()->format('Y-m-d') }}):</p>
    
        @php
            $projectDurations = [];
            $dayTotal = 0;
            foreach($logs as $log) {
                $name = $log->project->name ?? 'No Project';
                if (!isset($projectDurations[$name])) {
                    $projectDurations[$name] = 0;
                }
                $projectDurations[$name] += $log->duration;
                $dayTotal += $log->duration;
            }
        @endphp

        <div class="user-section">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 5px;">
                <tr>
                    <td align="left" style="padding: 5px 15px; font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase;">PROJECT</td>
                    <td align="right" style="padding: 5px 15px; font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase;">TIME</td>
                </tr>
            </table>

            @foreach($projectDurations as $name => $duration)
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 12px;">
                    <tr>
                        <td style="background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.05); border-radius: 8px; padding: 12px 15px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td align="left" style="font-weight: bold; color: #444; font-size: 16px;">
                                        {{ $name }}
                                    </td>
                                    <td align="right" style="white-space: nowrap;">
                                        <span style="color: #444; font-weight: 600; font-size: 15px; background: rgba(0,0,0,0.05); padding: 5px 10px; border-radius: 4px; display: inline-block;">
                                            {{ floor($duration / 60) }}h {{ $duration % 60 }}m
                                        </span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            @endforeach
        
            <div class="total">
                Today's Total: {{ floor($dayTotal / 60) }}h {{ $dayTotal % 60 }}m
            </div>
        </div>
    
        <div class="weekly-total">
            <strong>Weekly Total:</strong> {{ floor($weeklyTotal / 60) }}h {{ $weeklyTotal % 60 }}m
        </div>
    </div>
</body>
</html>
