import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { authAPI } from '../api/auth';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      const result = await authAPI.login(data);
      login(result.user);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;
      const message = err.response?.data?.message ?? 'Login failed';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] relative overflow-hidden px-4 sm:px-6 lg:px-8">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute top-[20%] right-[10%] w-20 h-20 bg-pink-500/20 rounded-full blur-xl"></div>
      <div className="absolute bottom-[20%] left-[10%] w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>

      <div className="max-w-md w-full z-10">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-8 space-y-8">
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-2xl shadow-lg transform -rotate-6 hover:rotate-0 transition-transform duration-300">
              <img src="/tracker_logo.png" alt="Tracker Logo" className="h-16 w-auto" />
            </div>
            <h2 className="mt-8 text-center text-4xl font-black text-white tracking-tight">
              Welcome Back!
            </h2>
            <p className="mt-2 text-indigo-200 text-sm font-medium">
              Ready to track your success today?
            </p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-indigo-100 mb-1 ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-indigo-300 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  <input
                    id="email"
                    {...register('email')}
                    type="email"
                    className="block w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 text-white placeholder-indigo-300/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/10 transition-all sm:text-sm"
                    placeholder="name@company.com"
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs font-medium text-pink-400 ml-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-indigo-100 mb-1 ml-1">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-indigo-300 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  <input
                    id="password"
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="block w-full pl-11 pr-12 py-3 bg-white/5 border border-white/10 text-white placeholder-indigo-300/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/10 transition-all sm:text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-indigo-300 hover:text-white transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs font-medium text-pink-400 ml-1">{errors.password.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-white/10 rounded bg-white/5"
                />
                <label htmlFor="remember-me" className="ml-2 block text-xs text-indigo-200">
                  Remember me
                </label>
              </div>
              <div className="text-xs">
                <a href="#" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-600/20"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : 'Sign in to Dashboard'}
              </button>
            </div>
          </form>

          <p className="text-center text-xs text-indigo-300/60 pt-4">
            &copy; 2026 EMS Tracker Webndevs. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
