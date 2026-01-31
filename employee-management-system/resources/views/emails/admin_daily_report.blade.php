<!DOCTYPE html>
<html>
<head>
    <title>Admin Daily Team Report</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        /* Mobile overrides */
        @media only screen and (max-width: 600px) {
            .container-padding { padding: 10px !important; }
            .content-padding { padding: 15px 20px !important; }
            .card-padding { padding: 12px !important; }
            .inner-padding { padding: 8px 10px !important; }
            .header-font { font-size: 22px !important; }
            .text-font { font-size: 14px !important; }
            .project-name { font-size: 13px !important; word-break: break-word; }
            .time-badge { font-size: 12px !important; }
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
                            <h2 style="margin: 0; color: #333333; font-size: 24px;" class="header-font">Team Daily Activity Report</h2>
                            <p style="margin: 10px 0 0; color: #666666; font-size: 16px;" class="text-font">{{ $date->format('Y-m-d') }}</p>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 40px;" class="content-padding">
                            @php
                                $bgColors = ['#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#FFEBEE', '#F1F8E9', '#E0F7FA', '#FFF8E1'];
                            @endphp

                            @foreach($reportData as $data)
                                @php
                                    $bgColor = $bgColors[$loop->index % count($bgColors)];
                                @endphp
                                
                                <!-- User Section Wrapper -->
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: {{ $bgColor }}; border-radius: 8px; margin-bottom: 25px;">
                                    <tr>
                                        <td style="padding: 20px;" class="card-padding">
                                            <!-- User Header -->
                                            <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 15px;">
                                                <tr>
                                                    <td align="left" style="font-size: 18px; font-weight: bold; color: #333333; padding-bottom: 5px;" class="header-font">
                                                        {{ $data['user']->name }}
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td align="left">
                                                        <span style="background-color: rgba(255,255,255,0.6); padding: 5px 12px; border-radius: 15px; font-size: 13px; color: #333333; font-weight: bold; display: inline-block;" class="time-badge">
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

                                            <!-- Columns Header -->
                                            <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 5px;">
                                                <tr>
                                                    <td style="font-size: 11px; font-weight: bold; color: #666666; text-transform: uppercase;">Project</td>
                                                    <td align="right" style="font-size: 11px; font-weight: bold; color: #666666; text-transform: uppercase;">Time</td>
                                                </tr>
                                            </table>

                                            <!-- Projects -->
                                            @foreach($projectDurations as $name => $duration)
                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 8px;">
                                                    <tr>
                                                        <td style="background-color: rgba(255,255,255,0.7); border-radius: 6px; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.05);" class="inner-padding">
                                                            <table width="100%" cellspacing="0" cellpadding="0" border="0">
                                                                <tr>
                                                                    <td style="font-weight: bold; color: #444444; font-size: 14px;" class="project-name">
                                                                        {{ $name }}
                                                                    </td>
                                                                    <td align="right" style="vertical-align: top; padding-left: 5px;">
                                                                        <span style="background-color: rgba(0,0,0,0.05); padding: 3px 8px; border-radius: 4px; font-size: 13px; font-weight: 500; color: #333333; white-space: nowrap;" class="time-badge">
                                                                            {{ floor($duration / 60) }}h {{ $duration % 60 }}m
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                @endforeach

                                                <!-- User Day Total -->
                                                <tr>
                                                    <td align="right" style="padding-top: 10px; font-weight: bold; color: #333333; font-size: 14px;" class="text-font">
                                                        Day Total: {{ floor($userDayTotal / 60) }}h {{ $userDayTotal % 60 }}m
                                                    </td>
                                                </tr>
                                        </td>
                                    </tr>
                                </table>
                            @endforeach
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px; text-align: center; background-color: #f4f4f4; color: #999999; font-size: 12px;" class="content-padding">
                            &copy; {{ date('Y') }} {{ config('app.name') }}. All rights reserved.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
