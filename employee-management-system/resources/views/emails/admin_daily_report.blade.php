<!DOCTYPE html>
<html>
<head>
    <title>Admin Daily Team Report</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <style>
        @media only screen and (max-width: 600px) {
            .container { width: 100% !important; max-width: 100% !important; }
            .content-padding { padding: 15px !important; }
            .card-padding { padding: 15px !important; }
            .project-name { font-size: 13px !important; }
            .time-text { font-size: 13px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
    <center>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f4; width: 100%;">
            <tr>
                <td align="center" style="padding: 20px 0;">
                    <!--[if mso]>
                    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                    <td>
                    <![endif]-->
                    <table class="container" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; max-width: 600px; width: 100%; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="padding: 25px 30px; text-align: center; background-color: #ffffff; border-bottom: 1px solid #eeeeee;" class="content-padding">
                                <h2 style="margin: 0; color: #2c3e50; font-size: 22px;">Team Daily Activity</h2>
                                <p style="margin: 8px 0 0; color: #7f8c8d; font-size: 15px;">{{ $date->format('l, F j, Y') }}</p>
                            </td>
                        </tr>

                        <!-- Content -->
                        <tr>
                            <td style="padding: 25px 30px;" class="content-padding">
                                @php
                                    $bgColors = ['#E3F2FD', '#E8F5E9', '#FFF3E0', '#F3E5F5', '#FFEBEE', '#F1F8E9', '#E0F7FA', '#FFF8E1'];
                                @endphp

                                @foreach($reportData as $data)
                                    @php
                                        $bgColor = $bgColors[$loop->index % count($bgColors)];
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
                                    
                                    <!-- User Card -->
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: {{ $bgColor }}; border-radius: 8px; margin-bottom: 20px;">
                                        <tr>
                                            <td style="padding: 20px;" class="card-padding">
                                                <!-- User Header -->
                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 15px;">
                                                    <tr>
                                                        <td align="left" style="padding-bottom: 5px;">
                                                            <strong style="font-size: 17px; color: #2c3e50;">{{ $data['user']->name }}</strong>
                                                        </td>
                                                    </tr>
                                                    <tr>
                                                        <td align="left">
                                                            <span style="background-color: rgba(255,255,255,0.7); padding: 4px 10px; border-radius: 12px; font-size: 12px; color: #455a64; font-weight: 600; display: inline-block;">
                                                                Weekly: {{ floor($data['weekly_total'] / 60) }}h {{ $data['weekly_total'] % 60 }}m
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </table>

                                                <!-- Table Header -->
                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 8px;">
                                                    <tr>
                                                        <td style="font-size: 11px; font-weight: 700; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px;">PROJECT</td>
                                                        <td align="right" style="font-size: 11px; font-weight: 700; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px;">TIME</td>
                                                    </tr>
                                                </table>

                                                <!-- Projects List (Single Table) -->
                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: separate; border-spacing: 0 4px;">
                                                    @foreach($projectDurations as $name => $duration)
                                                        <tr>
                                                            <td style="background-color: rgba(255,255,255,0.6); padding: 10px 12px; border-radius: 4px 0 0 4px; font-size: 14px; color: #34495e; font-weight: 500;" class="project-name">
                                                                {{ $name }}
                                                            </td>
                                                            <td align="right" style="background-color: rgba(255,255,255,0.6); padding: 10px 12px; border-radius: 0 4px 4px 0; font-size: 14px; color: #34495e; font-weight: 600; white-space: nowrap; width: 80px;" class="time-text">
                                                                {{ floor($duration / 60) }}h {{ $duration % 60 }}m
                                                            </td>
                                                        </tr>
                                                    @endforeach
                                                </table>

                                                <!-- Footer -->
                                                <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 10px;">
                                                    <tr>
                                                        <td align="right" style="font-size: 13px; font-weight: 700; color: #2c3e50;">
                                                            Day Total: {{ floor($userDayTotal / 60) }}h {{ $userDayTotal % 60 }}m
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                @endforeach

                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 20px; text-align: center; background-color: #f8f9fa; border-top: 1px solid #eeeeee;">
                                <p style="margin: 0; color: #95a5a6; font-size: 12px;">
                                    &copy; {{ date('Y') }} {{ config('app.name') }}. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                    <!--[if mso]>
                    </td>
                    </tr>
                    </table>
                    <![endif]-->
                </td>
            </tr>
        </table>
    </center>
</body>
</html>
