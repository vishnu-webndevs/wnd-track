import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';
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
      sessionStorage.removeItem('tt-2fa-verified');
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
    <div className="min-h-screen flex w-full bg-slate-950 font-sans overflow-hidden">
      
      {/* Left Panel: Branding & Decorative (Visible only on large screens) */}
      <div className="hidden lg:flex relative w-1/2 items-center justify-center overflow-hidden">
        {/* Animated Mesh Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 opacity-90 z-0"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-500/30 rounded-full blur-[120px] animate-pulse mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-fuchsia-500/20 rounded-full blur-[100px] animate-pulse mix-blend-screen" style={{ animationDelay: '2s' }}></div>
        
        {/* Abstract 3D-like floating shapes */}
        <div className="absolute top-[20%] right-[20%] w-24 h-24 bg-gradient-to-tr from-indigo-400 to-cyan-400 rounded-2xl rotate-12 opacity-80 blur-[2px] animate-bounce" style={{ animationDuration: '4s' }}></div>
        <div className="absolute bottom-[25%] left-[20%] w-16 h-16 bg-gradient-to-bl from-purple-400 to-pink-500 rounded-full opacity-60 blur-[1px] animate-bounce" style={{ animationDuration: '6s', animationDelay: '1s' }}></div>

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col items-start px-16 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-indigo-200 text-sm font-semibold mb-8 shadow-2xl">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>EMS Tracker by Webndevs</span>
          </div>
          <h1 className="text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-200 tracking-tight leading-[1.1] mb-6">
            Empower Your Team's Productivity.
          </h1>
          <p className="text-lg text-indigo-200/80 leading-relaxed max-w-lg font-medium">
            Streamline workflows, track progress in real-time, and securely manage your entire workforce from one centralized platform.
          </p>
        </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center relative bg-slate-950 px-6 sm:px-12">
        {/* Mobile background decors */}
        <div className="absolute lg:hidden top-0 left-0 w-full h-full bg-gradient-to-b from-indigo-900/20 to-slate-950 z-0"></div>
        <div className="absolute lg:hidden top-[-10%] right-[-10%] w-64 h-64 bg-indigo-500/20 rounded-full blur-[80px] z-0"></div>

        <div className="w-full max-w-md relative z-10">
          <div className="text-center lg:text-left mb-10">
            <div className="inline-flex lg:hidden bg-white/5 p-3 rounded-2xl border border-white/10 shadow-lg mb-6 transform -rotate-3">
              <img src="/tracker_logo.png" alt="Tracker Logo" className="h-10 w-auto brightness-200" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">
              Welcome back
            </h2>
            <p className="text-slate-400 text-sm font-medium">
              Please enter your details to sign in.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                  Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  <input
                    id="email"
                    {...register('email')}
                    type="email"
                    className="block w-full pl-12 pr-4 py-3.5 bg-slate-900/50 border border-slate-800 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all sm:text-sm shadow-inner"
                    placeholder="Enter your email"
                  />
                </div>
                {errors.email && (
                  <p className="mt-2 text-xs font-medium text-rose-400 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-rose-400"></span> {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-300 mb-2">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                  </div>
                  <input
                    id="password"
                    {...register('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="block w-full pl-12 pr-12 py-3.5 bg-slate-900/50 border border-slate-800 text-white placeholder-slate-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all sm:text-sm shadow-inner"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-indigo-400 transition-colors focus:outline-none"
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
                  <p className="mt-2 text-xs font-medium text-rose-400 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-rose-400"></span> {errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center group cursor-pointer">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-indigo-500 focus:ring-indigo-500/50 border-slate-700 rounded bg-slate-900 cursor-pointer transition-colors"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400 group-hover:text-slate-300 cursor-pointer transition-colors">
                  Remember me
                </label>
              </div>
              <div className="text-sm">
                <a href="#" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors hover:underline underline-offset-4">
                  Forgot password?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 focus:ring-indigo-500 transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/50"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-slate-500 font-medium">
            &copy; {new Date().getFullYear()} EMS Tracker Webndevs.<br/> All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
