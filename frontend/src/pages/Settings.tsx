import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';

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
    </div>
  );
}
