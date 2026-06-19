<!DOCTYPE html>
<html>
<head>
    <title>Timesheet Report</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Timesheet Report</h2>
        <p>Hello {{ $user->name }},</p>
        
        <p>Please find attached the <strong>{{ $periodLabel }} Timesheet Report</strong> for the period: <br>
        <strong>{{ $startDate }}</strong> to <strong>{{ $endDate }}</strong>.</p>
        
        <p>If you notice any discrepancies, please contact the administrator.</p>
        
        <br>
        <p style="font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 10px;">
            This is an automated message from the WND Tracker system. Please do not reply to this email.
        </p>
    </div>
</body>
</html>
