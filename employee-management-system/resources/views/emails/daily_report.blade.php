<!DOCTYPE html>
<html>
<head>
    <title>Daily Time Report</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Base styles are inline for compatibility */
        /* Mobile overrides */
        @media only screen and (max-width: 600px) {
            .container-padding { padding: 10px !important; }
            .content-padding { padding: 15px 20px !important; }
            .card-padding { padding: 10px !important; }
            .header-font { font-size: 22px !important; }
            .text-font { font-size: 14px !important; }
            .project-name { font-size: 14px !important; word-break: break-word; }
            .time-badge { font-size: 13px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4;">
        <tr>
            <td align="center" style="padding: 20px 0;" class="container-padding">
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; max-width: 600px; width: 100%; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;" class="content-padding">
                            <h2 style="margin: 0; color: #333333; font-size: 24px;" class="header-font">Daily Time Report</h2>
                            <p style="margin: 10px 0 0; color: #666666; font-size: 16px;" class="text-font">{{ now()->format('Y-m-d') }}</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 40px;" class="content-padding">
                            <p style="margin: 0 0 20px; color: #555555; font-size: 16px;" class="text-font">Hello {{ $user->name }},</p>
                            <p style="margin: 0 0 30px; color: #555555; line-height: 1.6; font-size: 16px;" class="text-font">Here is your time summary for today:</p>

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

                            <!-- Data Table -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #E3F2FD; border-radius: 8px; padding: 20px;" class="card-padding">
                                <tr>
                                    <td colspan="2" style="padding-bottom: 15px; border-bottom: 1px solid rgba(0,0,0,0.05);">
                                        <table width="100%" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="font-size: 12px; font-weight: bold; color: #666666; text-transform: uppercase;">Project</td>
                                                <td align="right" style="font-size: 12px; font-weight: bold; color: #666666; text-transform: uppercase;">Time</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                @foreach($projectDurations as $name => $duration)
                                    <tr>
                                        <td colspan="2" style="padding-top: 15px;">
                                            <table width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: rgba(255,255,255,0.7); border-radius: 6px; border: 1px solid rgba(0,0,0,0.05);">
                                                <tr>
                                                    <td style="padding: 12px 15px; font-weight: bold; color: #444444; font-size: 15px;" class="card-padding project-name">
                                                        {{ $name }}
                                                    </td>
                                                    <td align="right" style="padding: 12px 15px; vertical-align: top;" class="card-padding">
                                                        <span style="background-color: rgba(0,0,0,0.05); padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: 600; color: #333333; white-space: nowrap;" class="time-badge">
                                                            {{ floor($duration / 60) }}h {{ $duration % 60 }}m
                                                        </span>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                @endforeach

                                <tr>
                                    <td colspan="2" align="right" style="padding-top: 20px; font-size: 16px; font-weight: bold; color: #333333;" class="text-font">
                                        Today's Total: {{ floor($dayTotal / 60) }}h {{ $dayTotal % 60 }}m
                                    </td>
                                </tr>
                            </table>

                            <!-- Weekly Total -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 20px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #eeeeee;">
                                <tr>
                                    <td align="center" style="padding: 15px; color: #555555; font-size: 15px;" class="card-padding text-font">
                                        <strong>Weekly Total:</strong> {{ floor($weeklyTotal / 60) }}h {{ $weeklyTotal % 60 }}m
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px; text-align: center; background-color: #f4f4f4; color: #999999; font-size: 12px;" class="card-padding">
                            &copy; {{ date('Y') }} {{ config('app.name') }}. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
