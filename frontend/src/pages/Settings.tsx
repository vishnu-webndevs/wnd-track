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
  const [dailyTrackingLimit, setDailyTrackingLimit] = useState(9);

  useEffect(() => {
    if (telegramSetting) {
      setTelegramToggle(telegramSetting.send_worklog_telegram);
      setTelegramBotToken(telegramSetting.telegram_bot_token || '');
      if (telegramSetting.daily_tracking_limit_hours !== undefined) {
        setDailyTrackingLimit(telegramSetting.daily_tracking_limit_hours);
      }
    }
  }, [telegramSetting]);

  const telegramToggleMutation = useMutation({
    mutationFn: (enabled: boolean) => usersAPI.updateTelegramWorklogSetting({ send_worklog_telegram: enabled, telegram_bot_token: telegramBotToken, daily_tracking_limit_hours: dailyTrackingLimit }),
    onSuccess: (data) => {
      setTelegramToggle(data.send_worklog_telegram);
      setTelegramBotToken(data.telegram_bot_token || '');
      setDailyTrackingLimit(data.daily_tracking_limit_hours);
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
    mutationFn: (token: string) => usersAPI.updateTelegramWorklogSetting({ send_worklog_telegram: telegramToggle, telegram_bot_token: token, daily_tracking_limit_hours: dailyTrackingLimit }),
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

  const saveDailyLimitMutation = useMutation({
    mutationFn: (limit: number) => usersAPI.updateTelegramWorklogSetting({ send_worklog_telegram: telegramToggle, telegram_bot_token: telegramBotToken, daily_tracking_limit_hours: limit }),
    onSuccess: (data) => {
      setDailyTrackingLimit(data.daily_tracking_limit_hours);
      queryClient.invalidateQueries({ queryKey: ['telegram-worklog-setting'] });
      toast.success('Daily Tracking Limit updated successfully');
    },
    onError: (error: unknown) => {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message ?? 'Failed to update daily tracking limit');
    },
  });

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">Please log in to access this page.</p>
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
      {user?.role === 'admin' && (
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

            {/* Daily Tracking Limit Config Field */}
            <div className="pt-4 border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Daily Tracking Limit (Hours)</label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Set the daily goal for employees. They will receive a notification when their tracked time reaches this limit.
                </p>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={dailyTrackingLimit}
                      onChange={(e) => setDailyTrackingLimit(parseFloat(e.target.value) || 0)}
                      placeholder="e.g. 9"
                      className="block w-full border border-gray-300 rounded-lg pl-3 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={saveDailyLimitMutation.isPending}
                    onClick={() => saveDailyLimitMutation.mutate(dailyTrackingLimit)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-lg shadow transition-colors whitespace-nowrap"
                  >
                    {saveDailyLimitMutation.isPending ? 'Saving...' : 'Save Limit'}
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
      )}

      <SessionManagement />
    </div>
  );
}
