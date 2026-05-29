<?php

namespace App\Services;

class GoogleAuthenticator
{
    protected int $codeLength = 6;

    /**
     * Create a secure, random Base32 secret key (16 characters)
     */
    public function createSecret(int $secretLength = 16): string
    {
        $validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = '';
        for ($i = 0; $i < $secretLength; $i++) {
            $secret .= $validChars[random_int(0, 31)];
        }
        return $secret;
    }

    /**
     * Calculate the 6-digit passcode for a secret key at a specific time slice
     */
    public function getCode(string $secret, ?int $timeSlice = null): string
    {
        if ($timeSlice === null) {
            $timeSlice = (int)floor(time() / 30);
        }

        $secretkey = $this->base32Decode($secret);

        // Pack time into 8-byte binary string (big-endian)
        $time = chr(0).chr(0).chr(0).chr(0).pack('N', $timeSlice);
        
        // Hash the time with the secret key using HMAC-SHA1
        $hmac = hash_hmac('sha1', $time, $secretkey, true);
        
        // Get the offset (last 4 bits of hmac)
        $offset = ord(substr($hmac, -1)) & 0x0F;
        
        // Extract 4 bytes from hmac starting at offset
        $hashpart = substr($hmac, $offset, 4);
        
        // Unpack value to 32-bit unsigned integer
        $value = unpack('N', $hashpart)[1];
        
        // Ignore the sign bit
        $value = $value & 0x7FFFFFFF;
        
        $modulo = pow(10, $this->codeLength);
        return str_pad((string)($value % $modulo), $this->codeLength, '0', STR_PAD_LEFT);
    }

    /**
     * Verify a code with time-drift window of ±30 seconds (1 interval)
     */
    public function verifyCode(string $secret, string $code, int $discrepancy = 1, ?int $currentTimeSlice = null): bool
    {
        if ($currentTimeSlice === null) {
            $currentTimeSlice = (int)floor(time() / 30);
        }

        if (strlen($code) !== $this->codeLength) {
            return false;
        }

        for ($i = -$discrepancy; $i <= $discrepancy; $i++) {
            $calculatedCode = $this->getCode($secret, $currentTimeSlice + $i);
            if (hash_equals($calculatedCode, $code)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Generate the standard OTP Auth URL for QR Code scanning
     */
    public function getQRCodeUrl(string $name, string $secret, ?string $title = 'WND-Tracker'): string
    {
        $encodedName = rawurlencode($name);
        $encodedTitle = rawurlencode($title);
        return "otpauth://totp/{$encodedTitle}:{$encodedName}?secret={$secret}&issuer={$encodedTitle}";
    }

    /**
     * Helper: Decode Base32 string into binary
     */
    protected function base32Decode(string $secret): string
    {
        if (empty($secret)) {
            return '';
        }

        $base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $base32charsFlipped = array_flip(str_split($base32chars));

        $paddingCharCount = substr_count($secret, '=');
        $allowedValues = [6, 4, 3, 1, 0];
        if (!in_array($paddingCharCount, $allowedValues)) {
            return '';
        }

        for ($i = 0; $i < 4; $i++) {
            if ($paddingCharCount === $allowedValues[$i] && 
                substr($secret, -$allowedValues[$i]) !== str_repeat('=', $allowedValues[$i])) {
                return '';
            }
        }

        $secret = str_replace('=', '', $secret);
        $secret = str_split($secret);
        $binaryString = '';

        for ($i = 0; $i < count($secret); $i = $i + 8) {
            $x = '';
            if (!in_array($secret[$i], str_split($base32chars))) {
                return '';
            }
            
            for ($j = 0; $j < 8; $j++) {
                if (isset($secret[$i + $j])) {
                    $x .= str_pad(decbin($base32charsFlipped[$secret[$i + $j]]), 5, '0', STR_PAD_LEFT);
                }
            }
            
            $eightBits = str_split($x, 8);
            for ($z = 0; $z < count($eightBits); $z++) {
                if (strlen($eightBits[$z]) === 8) {
                    $binaryString .= chr(bindec($eightBits[$z]));
                }
            }
        }

        return $binaryString;
    }
}
