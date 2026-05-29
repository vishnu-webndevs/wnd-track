<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Verification Code</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #f8fafc;
            color: #334155;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }
        .wrapper {
            width: 100%;
            background-color: #f8fafc;
            padding: 40px 0;
        }
        .container {
            max-width: 540px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 10px 15px -3px rgba(0, 0, 0, 0.05);
            border: 1px solid #e2e8f0;
        }
        .header {
            background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
            padding: 32px;
            text-align: center;
        }
        .header img {
            width: 56px;
            height: auto;
            margin-bottom: 12px;
        }
        .header h1 {
            color: #ffffff;
            font-size: 22px;
            font-weight: 700;
            margin: 0;
            letter-spacing: -0.5px;
        }
        .content {
            padding: 40px 32px;
            text-align: center;
        }
        .greeting {
            font-size: 16px;
            font-weight: 600;
            color: #1e293b;
            margin-top: 0;
            margin-bottom: 16px;
        }
        .text {
            font-size: 15px;
            line-height: 1.6;
            color: #475569;
            margin-bottom: 32px;
        }
        .otp-container {
            background-color: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px 24px;
            display: inline-block;
            margin-bottom: 32px;
            letter-spacing: 6px;
        }
        .otp-code {
            font-size: 32px;
            font-weight: 800;
            color: #4f46e5;
            margin: 0;
            font-family: 'Courier New', Courier, monospace;
        }
        .warning-box {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            border-radius: 6px;
            padding: 16px;
            text-align: left;
            margin-bottom: 24px;
        }
        .warning-box p {
            font-size: 13px;
            line-height: 1.5;
            color: #b45309;
            margin: 0;
        }
        .footer {
            background-color: #f8fafc;
            padding: 24px;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            font-size: 12px;
            color: #94a3b8;
        }
        .footer p {
            margin: 4px 0;
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <!-- SVG Shield Lock -->
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="white" style="width: 48px; height: 48px; margin: 0 auto 12px auto; display: block;">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <h1>Security Verification Required</h1>
            </div>
            <div class="content">
                <p class="greeting">Hello {{ $adminName }},</p>
                <p class="text">
                    You have requested access to the <strong>Timesheets Dashboard</strong> on the Admin Panel. To verify your identity and protect sensitive tracking data, please use the following one-time passcode (OTP):
                </p>
                <div class="otp-container">
                    <div class="otp-code">{{ $otpCode }}</div>
                </div>
                <div class="warning-box">
                    <p>
                        <strong>Security Reminder:</strong> This verification code is valid for <strong>10 minutes</strong> and is strictly confidential. Never share this code with anyone. If you did not make this request, please contact support or update your password immediately.
                    </p>
                </div>
            </div>
            <div class="footer">
                <p>This is an automated security notification from your Employee Management System.</p>
                <p>&copy; {{ date('Y') }} WebNDevs. All rights reserved.</p>
            </div>
        </div>
    </div>
</body>
</html>
