import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Users, 
  Briefcase, 
  CheckSquare, 
  Settings, 
  LogOut,
  Menu,
  X,
  User,
  Building2,
  Timer
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { timeTrackingAPI } from '../api/timeTracking';
import { authAPI } from '../api/auth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const activityCountsRef = useRef({ keyboard: 0, mouse: 0, scroll: 0 });
  const flushIntervalRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const trackingActiveRef = useRef<boolean>(false);
  const startAtRef = useRef<string | null>(null);
  const projectIdRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef<Date | null>(null);
  const [elapsed, setElapsed] = useState<string>('');
  const [trackingOn, setTrackingOn] = useState<boolean>(false);

  

  useEffect(() => {
    const readTracker = () => {
      try {
        const raw = localStorage.getItem('tt-tracker');
        if (!raw) return { isTracking: false } as { isTracking: boolean; startAt?: string; projectId?: number };
        return JSON.parse(raw) as { isTracking: boolean; startAt?: string; projectId?: number };
      } catch (e) {
        void e;
        return { isTracking: false } as { isTracking: boolean; startAt?: string; projectId?: number };
      }
    };

    const attachListeners = () => {
      const onClick = () => { activityCountsRef.current.mouse++; };
      const onKey = () => { activityCountsRef.current.keyboard++; };
      const onScroll = () => { activityCountsRef.current.scroll++; };
      
      document.addEventListener('mousedown', onClick);
      document.addEventListener('keydown', onKey);
      window.addEventListener('wheel', onScroll, { passive: true } as AddEventListenerOptions);
      
      return () => {
        document.removeEventListener('mousedown', onClick);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('wheel', onScroll);
      };
    };

    const flushActivity = async () => {
      if (!trackingActiveRef.current || !startAtRef.current || !projectIdRef.current) return;
      
      // Skip if on time-tracking page, because TimeTracking.tsx handles data collection
      if (location.pathname === '/time-tracking') {
        activityCountsRef.current = { keyboard: 0, mouse: 0, scroll: 0 };
        return;
      }

      const now = new Date();
      const counts = activityCountsRef.current;
      
      // Reset counts
      activityCountsRef.current = { keyboard: 0, mouse: 0, scroll: 0 };
      
      const url = window.location.href;
      
      try {
        await timeTrackingAPI.syncActivityLog({
          project_id: projectIdRef.current,
          activity_type: 'input_counts',
          url,
          started_at: (lastFlushAtRef.current ? lastFlushAtRef.current.toISOString() : startAtRef.current) as string,
          ended_at: now.toISOString(),
          duration: 60, // approx 1 minute interval
          desktop_app_id: 'web',
          keyboard_count: counts.keyboard,
          mouse_click_count: counts.mouse,
          mouse_scroll_count: counts.scroll,
        });
      } catch (e) {
        void e;
      }
      
      lastFlushAtRef.current = now;
    };

    const interval = window.setInterval(flushActivity, 60 * 1000);
    flushIntervalRef.current = interval;
    
    // Initial sync check
    const state = readTracker();
    if (state.isTracking) {
      trackingActiveRef.current = true;
      startAtRef.current = state.startAt || null;
      projectIdRef.current = state.projectId || null;
      lastFlushAtRef.current = new Date(); // Start counting from now for activity
    }

    const listenersCleanup = attachListeners();
    
    // Poll for tracker state changes (in case started/stopped in another tab/window)
    const pollInterval = window.setInterval(() => {
      const s = readTracker();
      if (s.isTracking !== trackingActiveRef.current) {
        trackingActiveRef.current = s.isTracking;
        startAtRef.current = s.startAt || null;
        projectIdRef.current = s.projectId || null;
        if (s.isTracking) {
           lastFlushAtRef.current = new Date();
        }
      }
    }, 2000);
    pollIntervalRef.current = pollInterval;

    return () => {
      window.clearInterval(interval);
      window.clearInterval(pollInterval);
      listenersCleanup();
    };
  }, [location.pathname]);

  // Global timer ticker
  useEffect(() => {
    const tick = () => {
      const raw = localStorage.getItem('tt-tracker');
      let isTracking = false;
      let startAt: string | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          isTracking = !!parsed.isTracking;
          startAt = parsed.startAt || null;
        } catch { void 0; }
      }
      setTrackingOn(isTracking && !!startAt);
      if (isTracking && startAt) {
        const start = new Date(startAt).getTime();
        const now = Date.now();
        const diff = Math.max(0, Math.floor((now - start) / 1000));
        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        const hh = h.toString().padStart(2, '0');
        const mm = m.toString().padStart(2, '0');
        const ss = s.toString().padStart(2, '0');
        setElapsed(`${hh}:${mm}:${ss}`);
      } else {
        setElapsed('');
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Projects', href: '/projects', icon: Briefcase },
    { name: 'Tasks', href: '/tasks', icon: CheckSquare },
    { name: 'Clients', href: '/clients', icon: Building2 },
    ...(user?.role === 'employee' ? [{ name: 'Time Tracking', href: '/time-tracking', icon: Timer }] : []),
  ];

  const adminNavigation = [
    { name: 'Employees', href: '/employees', icon: Users },
    { name: 'Timesheets', href: '/timesheets', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      await authAPI.logout();
    } catch (e) {
      void e;
    }
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Handle Electron App Close Gracefully
  useEffect(() => {
    const w = window as unknown as { require?: (name: 'electron') => { ipcRenderer: { on: (channel: string, listener: (...args: unknown[]) => void) => void; removeListener: (channel: string, listener: (...args: unknown[]) => void) => void; send: (channel: string, ...args: unknown[]) => void } } };
    if (typeof w.require === 'function') {
      const { ipcRenderer } = w.require('electron');
      
      const handleAppClose = async () => {
        const raw = localStorage.getItem('tt-tracker');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.isTracking && parsed.startAt) {
              const end = new Date();
              const startAt = new Date(parsed.startAt);
              const durationMinutes = Math.round((end.getTime() - startAt.getTime()) / 1000 / 60);
              
              // Helper for local time string YYYY-MM-DD HH:mm:ss
              const toLocalISOString = (date: Date) => {
                const offset = date.getTimezoneOffset() * 60000;
                const localDate = new Date(date.getTime() - offset);
                return localDate.toISOString().slice(0, 19).replace('T', ' ');
              };

              // Stop tracking on server (using sync/beacon if possible, but fetch await is usually fine in Electron)
              if (parsed.timeLogId) {
                await timeTrackingAPI.updateTimeLog(parsed.timeLogId, {
                  end_time: toLocalISOString(end),
                  duration: durationMinutes,
                  description: parsed.note
                });
              } else if (parsed.projectId && parsed.taskId) {
                 // Create log if id missing (fallback)
                 await timeTrackingAPI.syncTimeLog({
                    project_id: parsed.projectId,
                    task_id: parsed.taskId,
                    start_time: parsed.startAt, 
                    end_time: toLocalISOString(end),
                    duration: durationMinutes,
                    description: parsed.note,
                    desktop_app_id: 'web'
                 });
              }
            }
          } catch (e) {
            console.error('Error stopping tracking on close:', e);
          }
        }
        
        // Remove tracker state
        localStorage.removeItem('tt-tracker');
        
        // Tell main process it's safe to close
        ipcRenderer.send('app-closed-confirmed');
      };

      ipcRenderer.on('app-close', handleAppClose);

      return () => {
        ipcRenderer.removeListener('app-close', handleAppClose);
      };
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar for mobile */}
      <div className={`fixed inset-0 flex z-40 lg:hidden ${sidebarOpen ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
            <div className="flex-shrink-0 flex items-center px-4">
              <h1 className="text-xl font-bold text-gray-900">EMS</h1>
            </div>
            <nav className="mt-5 px-2 space-y-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    isActive(item.href)
                      ? 'bg-indigo-100 text-indigo-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  } group flex items-center px-2 py-2 text-base font-medium rounded-md`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="mr-4 h-6 w-6" />
                  {item.name}
                </Link>
              ))}
              {user?.role === 'admin' && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Admin
                  </p>
                  {adminNavigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`${
                        isActive(item.href)
                          ? 'bg-indigo-100 text-indigo-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      } group flex items-center px-2 py-2 text-base font-medium rounded-md`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className="mr-4 h-6 w-6" />
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <User className="h-8 w-8 text-gray-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 bg-white border-r border-gray-200">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className="flex items-center flex-shrink-0 px-4">
                <h1 className="text-xl font-bold text-gray-900">EMS</h1>
              </div>
              <nav className="mt-5 flex-1 px-2 space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      isActive(item.href)
                        ? 'bg-indigo-100 text-indigo-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                ))}
                {user?.role === 'admin' && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Admin
                    </p>
                    {adminNavigation.map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        className={`${
                          isActive(item.href)
                            ? 'bg-indigo-100 text-indigo-900'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                      >
                        <item.icon className="mr-3 h-5 w-5" />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </nav>
            </div>
            <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
              <div className="flex items-center flex-shrink-0 w-full">
                <div className="flex-shrink-0">
                  <User className="h-8 w-8 text-gray-400" />
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-700">{user?.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-500"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        <div className="lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3">
          <button
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            {trackingOn && (
              <div className="sticky top-0 z-20 mb-4">
                <div className="flex items-center justify-between bg-green-50 text-green-700 border border-green-200 rounded px-3 py-2 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Timer className="w-4 h-4" />
                    <span className="font-semibold">Tracking</span>
                    <span className="font-mono">{elapsed}</span>
                  </div>
                  <Link to="/time-tracking" className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200">
                    Open Tracker
                  </Link>
                </div>
              </div>
            )}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
