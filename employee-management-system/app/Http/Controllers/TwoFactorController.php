<?php

namespace App\Http\Controllers;

use App\Mail\TwoFactorOtpMail;
use App\Services\GoogleAuthenticator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;

class TwoFactorController extends Controller
{
    protected GoogleAuthenticator $totp;

    public function __construct(GoogleAuthenticator $totp)
    {
        $this->middleware('auth:sanctum');
        $this->totp = $totp;
    }

    /**
     * Get user's current 2FA settings and configurations
     */
    public function getSettings(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA settings are only available for administrators.'], 403);
        }

        $remainingBackupCodes = 0;
        if ($user->two_factor_backup_codes) {
            try {
                $codes = json_decode(Crypt::decryptString($user->two_factor_backup_codes), true);
                if (is_array($codes)) {
                    $remainingBackupCodes = count($codes);
                }
            } catch (\Exception $e) {
                $remainingBackupCodes = 0;
            }
        }

        return response()->json([
            'enabled' => (bool)$user->two_factor_enabled,
            'method' => $user->two_factor_method ?: 'email',
            'totp_configured' => !empty($user->two_factor_secret),
            'backup_codes_configured' => !empty($user->two_factor_backup_codes),
            'remaining_backup_codes' => $remainingBackupCodes,
            'email' => $this->maskEmail($user->email)
        ]);
    }

    /**
     * Update user's general 2FA settings (enabling, disabling, method)
     */
    public function updateSettings(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA settings are only available for administrators.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'enabled' => 'required|boolean',
            'method' => 'required|in:email,totp,both',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Validate that if they enable TOTP or BOTH, they actually have configured TOTP secret
        if ($request->enabled) {
            if (in_array($request->method, ['totp', 'both']) && empty($user->two_factor_secret)) {
                return response()->json([
                    'message' => 'Please set up and verify your Authenticator App before selecting it as a verification method.'
                ], 422);
            }
        }

        $user->two_factor_enabled = $request->enabled;
        $user->two_factor_method = $request->method;
        $user->save();

        // Always clear their 2FA verification status from backend cache when settings change
        // to force a fresh verification with the active settings
        Cache::forget('2fa_verified_' . $user->id);

        return response()->json([
            'message' => '2FA configurations updated successfully.',
            'enabled' => (bool)$user->two_factor_enabled,
            'method' => $user->two_factor_method
        ]);
    }

    /**
     * Start Authenticator App setup by generating a secret key and QR code URL
     */
    public function setupTotp(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA is only available for administrators.'], 403);
        }

        // Generate temporary secret
        $secret = $this->totp->createSecret();

        // Store temporary secret in cache for 10 minutes
        Cache::put('2fa_temp_secret_' . $user->id, $secret, now()->addMinutes(10));

        // Generate standard OTP Auth URL
        $qrCodeUrl = $this->totp->getQRCodeUrl($user->email, $secret, 'WND-Tracker');

        // Embed in standard Google Chart/QRServer URL (clean, secure public API)
        $qrCodeImage = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" . urlencode($qrCodeUrl);

        return response()->json([
            'secret' => $secret,
            'qr_code_url' => $qrCodeImage
        ]);
    }

    /**
     * Verify a code scanned during setup and enable Authenticator App
     */
    public function verifyAndEnableTotp(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA is only available for administrators.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'code' => 'required|string|size:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $tempSecretKey = '2fa_temp_secret_' . $user->id;
        $secret = Cache::get($tempSecretKey);

        if (!$secret) {
            return response()->json(['message' => 'Authenticator setup session has expired. Please try again.'], 422);
        }

        // Verify OTP code against the temporary secret key
        $isValid = $this->totp->verifyCode($secret, $request->code);

        if (!$isValid) {
            return response()->json(['message' => 'Invalid verification code. Please check your Authenticator App and try again.'], 422);
        }

        // Save secret key in encrypted form
        $user->two_factor_secret = Crypt::encryptString($secret);
        
        // Auto-enable 2FA with totp method if not already enabled
        if (!$user->two_factor_enabled) {
            $user->two_factor_enabled = true;
            $user->two_factor_method = 'totp';
        }
        
        $user->save();

        // Clear active 2FA verification session so they are forced to verify with their newly linked app code next time
        Cache::forget('2fa_verified_' . $user->id);

        // Clear temporary cache
        Cache::forget($tempSecretKey);

        return response()->json([
            'message' => 'Authenticator App configured and verified successfully.',
            'enabled' => (bool)$user->two_factor_enabled,
            'method' => $user->two_factor_method
        ]);
    }

    /**
     * Disconnect/Remove Authenticator App configuration
     */
    public function disconnectTotp(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        // Clear secret key
        $user->two_factor_secret = null;

        // If the current method was 'totp' or 'both', fall back to 'email'
        if (in_array($user->two_factor_method, ['totp', 'both'])) {
            $user->two_factor_method = 'email';
        }

        $user->save();

        // Always forget 2FA verification status from backend cache
        Cache::forget('2fa_verified_' . $user->id);

        return response()->json([
            'message' => 'Authenticator App disconnected successfully. Verification method fallback to Email OTP.',
            'enabled' => (bool)$user->two_factor_enabled,
            'method' => $user->two_factor_method,
            'totp_configured' => false
        ]);
    }

    /**
     * Generate 10 new random 8-character recovery backup codes
     */
    public function generateBackupCodes(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA backup codes are only available for administrators.'], 403);
        }

        $codes = [];
        for ($i = 0; $i < 10; $i++) {
            $codes[] = strtoupper(bin2hex(random_bytes(4))); // 8-character code
        }

        // Save encrypted JSON array in database
        $user->two_factor_backup_codes = Crypt::encryptString(json_encode($codes));
        $user->save();

        return response()->json([
            'message' => '10 backup recovery codes generated successfully. Please copy or print them now.',
            'codes' => $codes
        ]);
    }

    /**
     * Send email OTP code
     */
    public function sendOtp(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Access denied. 2FA is only required for administrator actions.'], 403);
        }

        if ($user->two_factor_enabled && !in_array($user->two_factor_method, ['email', 'both'])) {
            return response()->json(['message' => 'Email verification is not enabled in your profile settings.'], 422);
        }

        $cooldownKey = '2fa_cooldown_' . $user->id;
        if (Cache::has($cooldownKey)) {
            return response()->json([
                'message' => 'Please wait before requesting another code.',
                'cooldown' => true
            ], 429);
        }

        $otp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $otpKey = '2fa_otp_' . $user->id;
        Cache::put($otpKey, $otp, now()->addMinutes(10));
        Cache::put($cooldownKey, true, now()->addSeconds(60));

        try {
            Mail::to($user->email)->send(new TwoFactorOtpMail($otp, $user->name));
            return response()->json([
                'message' => 'Verification code sent to your registered email successfully.',
                'email' => $this->maskEmail($user->email)
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Failed to send 2FA OTP: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to send verification email. Please check server mail configuration.'
            ], 500);
        }
    }

    /**
     * Verify codes: supporting Email, Authenticator (TOTP), and Backup Recovery Codes
     */
    public function verifyOtp(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['message' => '2FA is only required for administrators.'], 403);
        }

        $validator = Validator::make($request->all(), [
            'code' => 'required|string',
            'method' => 'required|in:email,totp,backup'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $code = trim($request->code);

        if ($request->method === 'email') {
            // Verify cached OTP code
            $otpKey = '2fa_otp_' . $user->id;
            $cachedOtp = Cache::get($otpKey);

            if (!$cachedOtp) {
                return response()->json(['message' => 'Verification code has expired or is invalid. Please request a new one.'], 422);
            }

            if ($code !== $cachedOtp) {
                return response()->json(['message' => 'Invalid verification code. Please check and try again.'], 422);
            }

            // Clear cache keys on success
            Cache::forget($otpKey);
            Cache::forget('2fa_cooldown_' . $user->id);

        } elseif ($request->method === 'totp') {
            // Verify TOTP using GoogleAuthenticator
            if (empty($user->two_factor_secret)) {
                return response()->json(['message' => 'Authenticator App is not configured in your settings.'], 422);
            }

            try {
                $secret = Crypt::decryptString($user->two_factor_secret);
            } catch (\Exception $e) {
                return response()->json(['message' => 'Failed to retrieve authenticator credentials.'], 500);
            }

            $isValid = $this->totp->verifyCode($secret, $code);

            if (!$isValid) {
                return response()->json(['message' => 'Invalid Authenticator code. Please check your app and try again.'], 422);
            }

        } elseif ($request->method === 'backup') {
            // Verify backup recovery code
            if (empty($user->two_factor_backup_codes)) {
                return response()->json(['message' => 'No backup codes are configured for your account.'], 422);
            }

            try {
                $backupCodes = json_decode(Crypt::decryptString($user->two_factor_backup_codes), true);
            } catch (\Exception $e) {
                return response()->json(['message' => 'Failed to retrieve backup credentials.'], 500);
            }

            if (!is_array($backupCodes) || empty($backupCodes)) {
                return response()->json(['message' => 'No backup codes remaining.'], 422);
            }

            $codeIndex = array_search(strtoupper($code), $backupCodes);

            if ($codeIndex === false) {
                return response()->json(['message' => 'Invalid recovery code. Please check and try again.'], 422);
            }

            // Consume backup code (delete from array)
            unset($backupCodes[$codeIndex]);
            
            // Re-encrypt remaining codes and save
            $user->two_factor_backup_codes = Crypt::encryptString(json_encode(array_values($backupCodes)));
            $user->save();
        }

        // Complete 2FA session verification
        $verifiedKey = '2fa_verified_' . $user->id;
        Cache::put($verifiedKey, true, now()->addHours(2));

        return response()->json([
            'message' => 'Two-factor authentication verified successfully.',
            'verified' => true
        ]);
    }

    /**
     * Check if 2FA session status is active or if user has 2FA disabled entirely
     */
    public function checkStatus(Request $request)
    {
        $user = Auth::user();

        if ($user->role !== 'admin') {
            return response()->json(['verified' => true]);
        }

        // If 2FA is disabled in settings, they are automatically bypass-verified
        if (!$user->two_factor_enabled) {
            return response()->json(['verified' => true]);
        }

        $verifiedKey = '2fa_verified_' . $user->id;
        $isVerified = Cache::has($verifiedKey);

        // Also return the available methods so the frontend can display them to select
        $methods = [];
        if (in_array($user->two_factor_method, ['email', 'both'])) {
            $methods[] = 'email';
        }
        if (in_array($user->two_factor_method, ['totp', 'both']) && !empty($user->two_factor_secret)) {
            $methods[] = 'totp';
        }
        if (!empty($user->two_factor_backup_codes)) {
            try {
                $backupCodes = json_decode(Crypt::decryptString($user->two_factor_backup_codes), true);
                if (is_array($backupCodes) && count($backupCodes) > 0) {
                    $methods[] = 'backup';
                }
            } catch (\Exception $e) { }
        }

        return response()->json([
            'verified' => $isVerified,
            'methods' => $methods,
            'default_method' => $user->two_factor_method === 'both' ? 'totp' : $user->two_factor_method
        ]);
    }

    /**
     * Mask email address helper
     */
    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email);
        if (count($parts) < 2) {
            return $email;
        }
        $name = $parts[0];
        $domain = $parts[1];
        
        $length = strlen($name);
        if ($length <= 2) {
            $maskedName = str_repeat('*', $length);
        } else {
            $maskedName = substr($name, 0, 1) . str_repeat('*', $length - 2) . substr($name, -1);
        }
        
        return $maskedName . '@' . $domain;
    }
}
