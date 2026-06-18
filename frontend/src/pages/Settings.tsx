import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import { usersAPI } from '../api/users';
import { authAPI } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import SessionManagement from '../components/settings/SessionManagement';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z.object({
  password: z.string().min(8, 'Minimum 8 characters'),
  password_confirmation: z.string().min(8, 'Minimum 8 characters'),
}).refine((data) => data.password === data.password_confirmation, {
  message: 'Passwords do not match',
  path: ['password_confirmation'],
});

type PasswordForm = z.infer<typeof passwordSchema>;

export default function Settings() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      department: user?.department ?? '',
      position: user?.position ?? '',
    },
  });

  useEffect(() => {
    profileForm.reset({
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      department: user?.department ?? '',
      position: user?.position ?? '',
    });
  }, [profileForm, user]);

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: '',
      password_confirmation: '',
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: ProfileForm) => {
      if (!user) throw new Error('Not authenticated');
      const updated = await usersAPI.updateUser(user.id, payload);
      return updated;
    },
    onSuccess: (updated) => {
      updateUser(updated);
      toast.success('Profile updated');
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update profile');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (payload: PasswordForm) => {
      if (!user) throw new Error('Not authenticated');
      await usersAPI.resetPassword(user.id, payload.password, payload.password_confirmation);
    },
    onSuccess: () => {
      passwordForm.reset({ password: '', password_confirmation: '' });
      toast.success('Password updated');
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update password');
    },
  });

  // Telegram Work Log Setting
  const { data: telegramSetting } = useQuery({
    queryKey: ['telegram-worklog-setting'],
    queryFn: () => usersAPI.getTelegramWorklogSetting(),
    enabled: !!user && user.role === 'admin',
  });

  const [telegramToggle, setTelegramToggle] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [showBotToken, setShowBotToken] = useState(false);

  useEffect(() => {
    if (telegramSetting) {
      setTelegramToggle(telegramSetting.send_worklog_telegram);
      setTelegramBotToken(telegramSetting.telegram_bot_token || '');
    }
  }, [telegramSetting]);

  const telegramToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => usersAPI.updateTelegramWorklogSetting({ send_worklog_telegram: enabled, telegram_bot_token: telegramBotToken }),
    onSuccess: (data) => {
      setTelegramToggle(data.send_worklog_telegram);
      setTelegramBotToken(data.telegram_bot_token || '');
      queryClient.invalidateQueries({ queryKey: ['telegram-worklog-setting'] });
      toast.success(data.send_worklog_telegram ? 'Telegram work log notifications enabled' : 'Telegram work log notifications disabled');
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update setting');
      setTelegramToggle(!telegramToggle);
    },
  });

  const saveBotTokenMutation = useMutation({
    mutationFn: (token: string) => usersAPI.updateTelegramWorklogSetting({ send_worklog_telegram: telegramToggle, telegram_bot_token: token }),
    onSuccess: (data) => {
      setTelegramBotToken(data.telegram_bot_token || '');
      queryClient.invalidateQueries({ queryKey: ['telegram-worklog-setting'] });
      toast.success('Telegram Bot Token updated successfully');
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update bot token');
    },
  });

  // 2FA Settings States
  const { data: twoFactorSettings, refetch: refetch2FaSettings } = useQuery({
    queryKey: ['2fa-settings'],
    queryFn: () => authAPI.get2FaSettings(),
    enabled: !!user && user.role === 'admin',
  });

  const [twoFactorToggle, setTwoFactorToggle] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'totp' | 'both'>('email');
  
  // TOTP setup wizard state
  const [showTotpSetupModal, setShowTotpSetupModal] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; qr_code_url: string } | null>(null);
  const [totpVerificationCode, setTotpVerificationCode] = useState('');
  const [totpSetupError, setTotpSetupError] = useState('');
  const [isVerifyingSetup, setIsVerifyingSetup] = useState(false);

  // Backup codes state
  const [showBackupCodesModal, setShowBackupCodesModal] = useState(false);
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([]);
  const [isGeneratingBackup, setIsGeneratingBackup] = useState(false);

  // Toggle Verification Modal States
  const [showToggleVerifyModal, setShowToggleVerifyModal] = useState(false);
  const [pendingToggleValue, setPendingToggleValue] = useState<boolean | null>(null);
  const [toggleVerifyCode, setToggleVerifyCode] = useState<string[]>(Array(6).fill(''));
  const [toggleVerifyError, setToggleVerifyError] = useState('');
  const [isVerifyingToggle, setIsVerifyingToggle] = useState(false);
  const [toggleVerifyMethod, setToggleVerifyMethod] = useState<'email' | 'totp'>('email');
  const [toggleVerifyAvailableMethods, setToggleVerifyAvailableMethods] = useState<('email' | 'totp')[]>(['email']);
  const [isSendingToggleOtp, setIsSendingToggleOtp] = useState(false);
  const [toggleOtpCooldown, setToggleOtpCooldown] = useState(0);

  useEffect(() => {
    if (twoFactorSettings) {
      setTwoFactorToggle(twoFactorSettings.enabled);
      setTwoFactorMethod(twoFactorSettings.method || 'email');
    }
  }, [twoFactorSettings]);

  const update2FaSettingsMutation = useMutation({
    mutationFn: (payload: { enabled: boolean; method: 'email' | 'totp' | 'both' }) => authAPI.update2FaSettings(payload),
    onSuccess: (data) => {
      setTwoFactorToggle(data.enabled);
      setTwoFactorMethod(data.method);
      sessionStorage.removeItem('tt-2fa-verified');
      refetch2FaSettings();
      toast.success(data.enabled ? 'Two-Factor Authentication activated' : 'Two-Factor Authentication deactivated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update 2FA configuration');
      if (twoFactorSettings) {
        setTwoFactorToggle(twoFactorSettings.enabled);
        setTwoFactorMethod(twoFactorSettings.method);
      }
    }
  });

  const [isDisconnectingTotp, setIsDisconnectingTotp] = useState(false);

  const disconnectTotpMutation = useMutation({
    mutationFn: () => authAPI.disconnectTotp(),
    onMutate: () => {
      setIsDisconnectingTotp(true);
    },
    onSuccess: (data) => {
      setTwoFactorMethod(data.method);
      sessionStorage.removeItem('tt-2fa-verified');
      refetch2FaSettings();
      toast.success(data.message || 'Authenticator App disconnected successfully.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to disconnect Authenticator App');
    },
    onSettled: () => {
      setIsDisconnectingTotp(false);
    }
  });

  const handleDisconnectTotp = () => {
    if (confirm('Are you sure you want to completely remove/disconnect the Authenticator App from your account? This will fall back to Email OTP verification for 2FA security checks.')) {
      disconnectTotpMutation.mutate();
    }
  };

  useEffect(() => {
    if (toggleOtpCooldown > 0) {
      const timer = setTimeout(() => setToggleOtpCooldown(toggleOtpCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [toggleOtpCooldown]);

  const sendToggleOtp = async () => {
    setIsSendingToggleOtp(true);
    setToggleVerifyError('');
    try {
      await authAPI.send2FaOtp();
      setToggleOtpCooldown(60);
      toast.success('Verification code sent to your email.');
    } catch (err: any) {
      setToggleVerifyError(err.response?.data?.message || 'Failed to send verification code.');
    } finally {
      setIsSendingToggleOtp(false);
    }
  };

  const handleToggleVerifyMethodChange = async (method: 'email' | 'totp') => {
    setToggleVerifyMethod(method);
    setToggleVerifyError('');
    setToggleVerifyCode(Array(6).fill(''));
    if (method === 'email' && toggleOtpCooldown === 0) {
      await sendToggleOtp();
    }
  };

  const handleConfirmToggleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const code = toggleVerifyCode.join('').trim();
    if (code.length !== 6) {
      setToggleVerifyError('Please enter the full 6-digit code.');
      return;
    }

    setIsVerifyingToggle(true);
    setToggleVerifyError('');
    try {
      const res = await authAPI.verify2FaOtp(code, toggleVerifyMethod);
      if (res.verified) {
        if (pendingToggleValue !== null) {
          update2FaSettingsMutation.mutate({ enabled: pendingToggleValue, method: twoFactorMethod });
        }
        setShowToggleVerifyModal(false);
      }
    } catch (err: any) {
      setToggleVerifyError(err.response?.data?.message || 'Verification failed. Please check and try again.');
    } finally {
      setIsVerifyingToggle(false);
    }
  };

  const startTotpSetup = async () => {
    setTotpSetupError('');
    setTotpVerificationCode('');
    try {
      const data = await authAPI.setupTotp();
      setTotpSetupData(data);
      setShowTotpSetupModal(true);
    } catch {
      toast.error('Failed to initialize Authenticator App setup');
    }
  };

  const handleVerifyTotpSetup = async () => {
    if (!totpVerificationCode || totpVerificationCode.length !== 6) {
      setTotpSetupError('Please enter a valid 6-digit code.');
      return;
    }
    setIsVerifyingSetup(true);
    setTotpSetupError('');
    try {
      await authAPI.verifyTotpSetup(totpVerificationCode);
      sessionStorage.removeItem('tt-2fa-verified');
      toast.success('Authenticator App linked and active!');
      setShowTotpSetupModal(false);
      refetch2FaSettings();
    } catch (err: any) {
      setTotpSetupError(err.response?.data?.message || 'Verification failed. Please check and try again.');
    } finally {
      setIsVerifyingSetup(false);
    }
  };

  const generateBackupCodesHandler = async () => {
    setIsGeneratingBackup(true);
    try {
      const res = await authAPI.generateBackupCodes();
      setGeneratedBackupCodes(res.codes || []);
      setShowBackupCodesModal(true);
      refetch2FaSettings();
      toast.success('Backup recovery codes generated successfully!');
    } catch {
      toast.error('Failed to generate backup recovery codes');
    } finally {
      setIsGeneratingBackup(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">My Profile</h2>
        <form
          className="space-y-4"
          onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              {...profileForm.register('name')}
            />
            {profileForm.formState.errors.name && (
              <p className="mt-1 text-sm text-red-600">{profileForm.formState.errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                {...profileForm.register('phone')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Department</label>
              <input
                type="text"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                {...profileForm.register('department')}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Position</label>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              {...profileForm.register('position')}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
        <form
          className="space-y-4"
          onSubmit={passwordForm.handleSubmit((data) => resetPasswordMutation.mutate(data))}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                {...passwordForm.register('password')}
              />
              {passwordForm.formState.errors.password && (
                <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                {...passwordForm.register('password_confirmation')}
              />
              {passwordForm.formState.errors.password_confirmation && (
                <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.password_confirmation.message}</p>
              )}
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={resetPasswordMutation.isPending}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resetPasswordMutation.isPending ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Telegram Notification Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">📱</span>
          <h2 className="text-lg font-semibold text-gray-900">Telegram Notifications</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900">Work Log Notifications via Telegram</h3>
              <p className="text-xs text-gray-500 mt-1">
                When enabled, employee work logs (start &amp; end) will also be sent to the admin Telegram chat along with email notifications.
              </p>
            </div>
            <div className="ml-4">
              <button
                type="button"
                role="switch"
                aria-checked={telegramToggle}
                disabled={telegramToggleMutation.isPending}
                onClick={() => {
                  const newValue = !telegramToggle;
                  setTelegramToggle(newValue);
                  telegramToggleMutation.mutate(newValue);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  telegramToggle ? 'bg-indigo-600' : 'bg-gray-300'
                } ${telegramToggleMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${
                    telegramToggle ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Bot Token Config Field */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Telegram Bot Token</label>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">
                Configure your system-wide Telegram Bot Token here. This will be securely stored in the database.
              </p>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type={showBotToken ? "text" : "password"}
                    autoComplete="new-password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    placeholder="Enter Telegram Bot Token (e.g. 8498191902:AAHQJjw...)"
                    className="block w-full border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    title={showBotToken ? "Hide token" : "Show token"}
                  >
                    {showBotToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={saveBotTokenMutation.isPending}
                  onClick={() => saveBotTokenMutation.mutate(telegramBotToken)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-lg shadow transition-colors whitespace-nowrap"
                >
                  {saveBotTokenMutation.isPending ? 'Saving...' : 'Save Token'}
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 italic">
            Note: Employee availability notifications (tracker start) are always sent to Telegram regardless of this setting.
            Work updates are always sent via email to all admin users.
          </p>
        </div>
      </div>

      {/* Two-Factor Authentication (2FA) Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🔐</span>
          <h2 className="text-lg font-semibold text-gray-900">Two-Factor Authentication (2FA)</h2>
        </div>

        <div className="space-y-4">
          {/* Main 2FA Enable/Disable Switch */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-gray-900">Enable Two-Factor Authentication</h3>
              <p className="text-xs text-gray-500 mt-1">
                Protect your administrator account and timesheet data. When enabled, a secondary security verification is required to access sensitive portals.
              </p>
            </div>
            <div className="ml-4">
              <button
                type="button"
                role="switch"
                aria-checked={twoFactorToggle}
                disabled={update2FaSettingsMutation.isPending}
                onClick={async () => {
                  const newValue = !twoFactorToggle;
                  if (newValue && !twoFactorSettings?.totp_configured && twoFactorMethod !== 'email') {
                    toast.warning('Please configure the Authenticator App or select Email OTP as your 2FA method.');
                    return;
                  }
                  
                  if (newValue) {
                    // Simply enable without OTP, so admin can choose method afterwards
                    update2FaSettingsMutation.mutate({ enabled: true, method: twoFactorMethod });
                    return;
                  }

                  // Setup verification modal for DISABLING 2FA
                  setPendingToggleValue(newValue);
                  setToggleVerifyCode(Array(6).fill(''));
                  setToggleVerifyError('');
                  
                  const methods: ('email' | 'totp')[] = ['email'];
                  if (twoFactorSettings?.totp_configured) {
                    methods.push('totp');
                  }
                  setToggleVerifyAvailableMethods(methods);
                  
                  const defaultM = twoFactorSettings?.totp_configured ? 'totp' : 'email';
                  setToggleVerifyMethod(defaultM);
                  setShowToggleVerifyModal(true);

                  if (defaultM === 'email') {
                    await sendToggleOtp();
                  }
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  twoFactorToggle ? 'bg-indigo-600' : 'bg-gray-300'
                } ${update2FaSettingsMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${
                    twoFactorToggle ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 2FA Configuration Methods Options */}
          {twoFactorToggle && (
            <div className="p-4 border border-indigo-100 rounded-lg bg-indigo-50/20 space-y-4">
              <h4 className="text-sm font-semibold text-indigo-950">Select Your Verification Methods</h4>
              <p className="text-xs text-gray-600">Choose one or more active security challenges:</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method Option: Email OTP */}
                <div className="flex items-start p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center h-5">
                    <input
                      id="method-email"
                      name="2fa-method"
                      type="radio"
                      checked={twoFactorMethod === 'email'}
                      onChange={() => {
                        setTwoFactorMethod('email');
                        update2FaSettingsMutation.mutate({ enabled: true, method: 'email' });
                      }}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="method-email" className="font-medium text-gray-700 block">
                      Email Passcode (OTP)
                    </label>
                    <span className="text-xs text-gray-500">
                      Send a 6-digit one-time passcode to your email: <strong>{twoFactorSettings?.email}</strong>
                    </span>
                  </div>
                </div>

                {/* Method Option: Authenticator App */}
                <div className="flex items-start p-3 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center h-5">
                    <input
                      id="method-totp"
                      name="2fa-method"
                      type="radio"
                      checked={twoFactorMethod === 'totp'}
                      onChange={() => {
                        if (!twoFactorSettings?.totp_configured) {
                          toast.error('Authenticator App is not configured. Please complete setup first.');
                          return;
                        }
                        setTwoFactorMethod('totp');
                        update2FaSettingsMutation.mutate({ enabled: true, method: 'totp' });
                      }}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="method-totp" className="font-medium text-gray-700 block">
                      Authenticator App (TOTP)
                    </label>
                    <span className="text-xs text-gray-500">
                      Use Google/Microsoft Authenticator to generate secure dynamic passcodes.
                    </span>
                  </div>
                </div>

                {/* Method Option: Both */}
                <div className="flex items-start p-3 bg-white rounded-lg border border-gray-200 md:col-span-2">
                  <div className="flex items-center h-5">
                    <input
                      id="method-both"
                      name="2fa-method"
                      type="radio"
                      checked={twoFactorMethod === 'both'}
                      onChange={() => {
                        if (!twoFactorSettings?.totp_configured) {
                          toast.error('Authenticator App is not configured. Please complete setup first.');
                          return;
                        }
                        setTwoFactorMethod('both');
                        update2FaSettingsMutation.mutate({ enabled: true, method: 'both' });
                      }}
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="method-both" className="font-medium text-gray-700 block">
                      Dual Challenge (Email &amp; App)
                    </label>
                    <span className="text-xs text-gray-500">
                      Supports both methods during timesheet gate checks. Choose either when logging in.
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Block: Configure Authenticator and Backup Codes */}
              <div className="pt-3 border-t border-indigo-100 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={startTotpSetup}
                  className="px-4 py-2 border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {twoFactorSettings?.totp_configured ? '⚙️ Reconfigure Authenticator App' : '📲 Configure Authenticator App'}
                </button>

                {twoFactorSettings?.totp_configured && (
                  <button
                    type="button"
                    disabled={isDisconnectingTotp}
                    onClick={handleDisconnectTotp}
                    className="px-4 py-2 border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isDisconnectingTotp ? 'Disconnecting...' : '❌ Disconnect/Remove App'}
                  </button>
                )}

                <button
                  type="button"
                  disabled={isGeneratingBackup}
                  onClick={generateBackupCodesHandler}
                  className="px-4 py-2 border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {twoFactorSettings?.backup_codes_configured 
                    ? `🛡️ Regenerate Backup Codes (${twoFactorSettings.remaining_backup_codes} remaining)` 
                    : '🛡️ Generate Backup Recovery Codes'
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Google Authenticator (TOTP) Setup Wizard */}
      {showTotpSetupModal && totpSetupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-slideUp">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 p-5 bg-slate-50/50">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <span className="text-indigo-600 bg-indigo-50 p-1.5 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                  </svg>
                </span>
                Link Authenticator App
              </h3>
              <button 
                onClick={() => setShowTotpSetupModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold transition-colors animate-hover"
              >&times;</button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              {/* Step 1: Scan QR Code */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-extrabold w-5 h-5 flex items-center justify-center rounded-full">1</span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Scan QR Code</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pl-7">
                  Scan this image inside your Authenticator App (Google Authenticator, Microsoft Authenticator, Duo, Authy, etc.).
                </p>
                <div className="flex justify-center pt-2">
                  <div className="bg-white border-2 border-slate-100 p-3 rounded-2xl shadow-md transition-transform hover:scale-[1.02]">
                    <img 
                      src={totpSetupData.qr_code_url} 
                      alt="2FA QR Code" 
                      className="w-40 h-40 mx-auto"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Manual Secret Key */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-extrabold w-5 h-5 flex items-center justify-center rounded-full">2</span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Or Enter Key Manually</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pl-7">
                  If scanning is unavailable, enter this secret key into your app:
                </p>
                <div className="pl-7">
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5">
                    <div className="flex-1 font-mono text-center text-xs font-bold text-slate-700 select-all tracking-widest pl-2">
                      {totpSetupData.secret}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(totpSetupData.secret);
                        toast.success('Secret key copied!');
                      }}
                      className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 font-semibold py-1.5 px-2.5 rounded-lg text-xs shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-3.5 h-3.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z" />
                      </svg>
                      Copy
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 3: Enter Verification Code */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="bg-indigo-600 text-white text-xs font-extrabold w-5 h-5 flex items-center justify-center rounded-full">3</span>
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Confirm Verification Code</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pl-7">
                  Type the 6-digit confirmation code displayed in your Authenticator App:
                </p>
                
                <div className="pl-7 space-y-3">
                  {totpSetupError && (
                    <div className="bg-red-50 text-red-600 text-xs font-semibold rounded-xl p-3 border border-red-100 animate-shake">
                      {totpSetupError}
                    </div>
                  )}

                  <input
                    type="text"
                    maxLength={6}
                    placeholder="e.g. 123456"
                    value={totpVerificationCode}
                    onChange={(e) => setTotpVerificationCode(e.target.value.replace(/\D/g, ''))}
                    className="block w-full border-2 border-slate-200 rounded-xl py-3 px-3 text-center text-2xl font-black font-mono tracking-[0.6em] focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 bg-slate-50 focus:bg-white transition-all placeholder:tracking-normal placeholder:font-sans placeholder:font-semibold placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 border-t border-slate-100 p-5 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setShowTotpSetupModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVerifyingSetup || totpVerificationCode.length !== 6}
                onClick={handleVerifyTotpSetup}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 disabled:shadow-none hover:shadow-indigo-700/30 disabled:cursor-not-allowed transition-all"
              >
                {isVerifyingSetup ? 'Linking App...' : 'Verify and Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Display 10 Generated Backup Recovery Codes */}
      {showBackupCodesModal && generatedBackupCodes.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-slideUp">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 p-5 bg-slate-50/50">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <span className="text-emerald-600 bg-emerald-50 p-1.5 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </span>
                Recovery Backup Codes
              </h3>
              <button 
                onClick={() => setShowBackupCodesModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold transition-colors"
              >&times;</button>
            </div>

            {/* Scrollable Content */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              <div className="bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl p-4 border border-amber-100 leading-relaxed shadow-sm flex items-start gap-2.5">
                <span className="text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <strong className="block text-amber-950 mb-0.5">Save These Codes Immediately!</strong>
                  Backup codes allow you to bypass app security checks if you lose your phone. They are shown <strong className="text-amber-950">ONLY ONCE</strong>.
                </div>
              </div>

              {/* Codes Grid */}
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto py-2">
                {generatedBackupCodes.map((code, index) => (
                  <div 
                    key={index}
                    className="bg-slate-50 border-2 border-slate-100 hover:border-slate-200 rounded-xl py-2.5 px-3 text-sm font-mono font-black text-slate-700 tracking-wider shadow-sm text-center select-all transition-all hover:bg-white"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex flex-wrap gap-2.5 border-t border-slate-100 p-5 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(generatedBackupCodes.join('\n'));
                  toast.success('Codes copied to clipboard!');
                }}
                className="flex-1 min-w-[100px] py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4 text-slate-500">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z" />
                </svg>
                Copy
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 min-w-[100px] py-2 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096a42.415 42.415 0 0 0-10.56 0m10.56 0L17.66 18m0 0a2.25 2.25 0 0 1-2.25 2.25H8.59A2.25 2.25 0 0 1 6.34 18m11.318-8.22L16.5 3.75h-9L5.342 9.78m13.235 0a1.5 1.5 0 0 0-1.285-2.28H6.708a1.5 1.5 0 0 0-1.285 2.28m13.235 0A1.5 1.5 0 0 1 17.41 12H6.586a1.5 1.5 0 0 1-1.285-1.28" />
                </svg>
                Print
              </button>
              <button
                type="button"
                onClick={() => setShowBackupCodesModal(false)}
                className="flex-1 min-w-[120px] py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-700/30 transition-all"
              >
                I've Saved Them
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Verify Identity Before Toggling 2FA */}
      {showToggleVerifyModal && pendingToggleValue !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-slideUp">
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 p-5 bg-slate-50/50">
              <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                <span className="text-indigo-600 bg-indigo-50 p-1.5 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </span>
                Identity Verification
              </h3>
              <button 
                onClick={() => setShowToggleVerifyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold transition-colors"
              >&times;</button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              <div className="text-center space-y-2">
                <p className="text-sm text-slate-600 leading-relaxed font-sans">
                  You are requesting to <strong>{pendingToggleValue ? 'Activate' : 'Deactivate'}</strong> Two-Factor Authentication. Please verify your identity to proceed.
                </p>
              </div>

              {/* Method Tabs Switcher (Only if TOTP configured) */}
              {toggleVerifyAvailableMethods.length > 1 && (
                <div className="flex justify-center border-b border-slate-100 pb-2">
                  <div className="flex bg-slate-100 p-1 rounded-xl w-full">
                    <button
                      type="button"
                      onClick={() => handleToggleVerifyMethodChange('totp')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all outline-none ${
                        toggleVerifyMethod === 'totp' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      📲 App Code
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleVerifyMethodChange('email')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all outline-none ${
                        toggleVerifyMethod === 'email' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      ✉️ Email OTP
                    </button>
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="text-center">
                <p className="text-xs text-slate-400">
                  {toggleVerifyMethod === 'totp' 
                    ? 'Enter the 6-digit passcode from your Authenticator App (Google/Microsoft).'
                    : `We've sent a 6-digit OTP code to your registered email: ${twoFactorSettings?.email || 'your email'}`
                  }
                </p>
              </div>

              {/* Code Input */}
              <div className="space-y-4">
                {toggleVerifyError && (
                  <div className="bg-red-50 text-red-600 text-xs font-semibold rounded-xl p-3 border border-red-100 text-center animate-shake">
                    {toggleVerifyError}
                  </div>
                )}

                <div className="flex justify-between max-w-xs mx-auto gap-2">
                  {toggleVerifyCode.map((char, index) => (
                    <input
                      key={index}
                      id={`toggle-verify-input-${index}`}
                      type="text"
                      maxLength={1}
                      value={char}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val && !/^\d+$/.test(val)) return;

                        const newCode = [...toggleVerifyCode];
                        newCode[index] = val.slice(-1);
                        setToggleVerifyCode(newCode);
                        setToggleVerifyError('');

                        if (val && index < 5) {
                          const nextInput = document.getElementById(`toggle-verify-input-${index + 1}`);
                          if (nextInput) (nextInput as HTMLInputElement).focus();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !toggleVerifyCode[index] && index > 0) {
                          const prevInput = document.getElementById(`toggle-verify-input-${index - 1}`);
                          if (prevInput) {
                            (prevInput as HTMLInputElement).focus();
                            const newCode = [...toggleVerifyCode];
                            newCode[index - 1] = '';
                            setToggleVerifyCode(newCode);
                          }
                        }
                      }}
                      className="w-12 h-14 text-center text-xl font-extrabold text-gray-900 bg-slate-50 border border-slate-200 rounded-xl shadow-sm focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                      autoComplete="off"
                      disabled={isVerifyingToggle}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t border-slate-100 p-5 bg-slate-50/50 space-y-3">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowToggleVerifyModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isVerifyingToggle || toggleVerifyCode.some(c => !c)}
                  onClick={handleConfirmToggleVerify}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/20 disabled:shadow-none hover:shadow-indigo-700/30 disabled:cursor-not-allowed transition-all"
                >
                  {isVerifyingToggle ? 'Verifying...' : `Confirm & ${pendingToggleValue ? 'Enable' : 'Disable'}`}
                </button>
              </div>

              {toggleVerifyMethod === 'email' && (
                <div className="text-center text-xs">
                  {toggleOtpCooldown > 0 ? (
                    <span className="text-slate-400 font-medium">
                      Resend code in <strong className="text-indigo-600 font-semibold">{toggleOtpCooldown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendToggleOtp}
                      disabled={isSendingToggleOtp}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-4 disabled:opacity-50 transition-colors outline-none"
                    >
                      {isSendingToggleOtp ? 'Resending...' : 'Resend Verification Code'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SessionManagement />
    </div>
  );
}
