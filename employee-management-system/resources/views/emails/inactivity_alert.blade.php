<!DOCTYPE html>
<html>
<head>
    <title>Inactivity Alert</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f4f5f7; font-family: Arial, sans-serif; color: #333333;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 550px; margin: 0 auto; background-color: #ffffff; padding: 25px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <tr>
            <td>
                @if($recipientRole === 'self')
                    <h2 style="color: #dc2626; margin-top: 0; font-size: 20px;">⚠️ Tracker Inactivity Alert</h2>
                    <p style="font-size: 15px; line-height: 1.6;">
                        Hello <strong>{{ $user->name }}</strong>,
                    </p>
                    <p style="font-size: 15px; line-height: 1.6; color: #1f2937;">
                        You have not been available or logged any time on the <strong>WND Tracker</strong> platform for the last <strong style="color: #dc2626;">{{ $consecutiveDays }} working days</strong>.
                    </p>
                    <p style="font-size: 15px; line-height: 1.6; color: #4b5563;">
                        Please log in to your desktop tracker application and resume tracking your work.
                    </p>
                @else
                    <h2 style="color: #dc2626; margin-top: 0; font-size: 20px;">⚠️ User Inactivity Notification</h2>
                    <p style="font-size: 15px; line-height: 1.6;">
                        Notice to Admin / Manager,
                    </p>
                    <p style="font-size: 15px; line-height: 1.6; color: #1f2937;">
                        <strong>{{ $user->name }}</strong> (Role: <span style="text-transform: capitalize; font-weight: bold;">{{ str_replace('_', ' ', $user->role) }}</span>) 
                        has not been available or logged any time on the <strong>WND Tracker</strong> platform for the last <strong style="color: #dc2626;">{{ $consecutiveDays }} working days</strong>.
                    </p>
                    @if($user->email)
                        <p style="font-size: 14px; color: #6b7280; margin-top: 5px;">
                            Email: {{ $user->email }}
                        </p>
                    @endif
                @endif

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

                <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">
                    <em>* Saturday and Sunday are official non-working days and are excluded from inactivity calculations.</em>
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
