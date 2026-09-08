<!DOCTYPE html>
<html>
<head>
    <title>Inactivity Alert</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @media only screen and (max-width: 600px) {
            .content-padding { padding: 20px 20px !important; }
            .header-padding { padding: 20px 20px 15px !important; }
            .footer-padding { padding: 15px 20px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #333333; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f5f7; padding: 40px 15px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; width: 100%; margin: 0 auto; background-color: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="padding: 30px 35px 20px; background-color: #ffffff; border-bottom: 1px solid #f1f5f9;" class="header-padding">
                            @if($recipientRole === 'self')
                                <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                                    <span>⚠️</span> Tracker Inactivity Alert
                                </h2>
                            @else
                                <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                                    <span>⚠️</span> User Inactivity Notification
                                </h2>
                            @endif
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 30px 35px;" class="content-padding">
                            @if($recipientRole === 'self')
                                <p style="font-size: 15px; margin: 0 0 16px 0; color: #1f2937;">
                                    Hello <strong>{{ $user->name }}</strong>,
                                </p>
                                <p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 20px 0;">
                                    You have not been available or logged any time on the <strong>WND Tracker</strong> platform for the last <strong style="color: #dc2626;">{{ $consecutiveDays }} working days</strong>.
                                </p>
                                <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 4px; margin-bottom: 24px;">
                                    <p style="font-size: 14px; line-height: 1.5; color: #991b1b; margin: 0;">
                                        Please log in to your desktop tracker application and resume tracking your work.
                                    </p>
                                </div>
                            @else
                                <p style="font-size: 15px; margin: 0 0 16px 0; color: #1f2937;">
                                    Notice to Admin / Manager,
                                </p>
                                <p style="font-size: 15px; line-height: 1.6; color: #374151; margin: 0 0 20px 0;">
                                    <strong>{{ $user->name }}</strong> (Role: <span style="text-transform: capitalize; font-weight: 600;">{{ str_replace('_', ' ', $user->role) }}</span>) has not been available or logged any time on the <strong>WND Tracker</strong> platform for the last <strong style="color: #dc2626;">{{ $consecutiveDays }} working days</strong>.
                                </p>
                                @if($user->email)
                                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px;">
                                        <p style="font-size: 14px; color: #475569; margin: 0;">
                                            <strong>Employee Email:</strong> {{ $user->email }}
                                        </p>
                                    </div>
                                @endif
                            @endif
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 16px 35px; background-color: #f8fafc; border-top: 1px solid #f1f5f9;" class="footer-padding">
                            <p style="font-size: 12px; color: #64748b; margin: 0; line-height: 1.5;">
                                <em>* Saturday and Sunday are official non-working days and are excluded from inactivity calculations.</em>
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
