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
  Timer,
  MessageSquare,
  Video
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { timeTrackingAPI } from '../api/timeTracking';
import { teamAvailabilityAPI } from '../api/teamAvailability';
import { authAPI } from '../api/auth';
import NotificationBell from './NotificationBell';
import { useNotifications } from '../hooks/useNotifications';
import { useChatStore } from '../stores/chatStore';
import JoinMeetingPopup from './JoinMeetingPopup';
import MeetingBackgroundBar from './MeetingBackgroundBar';
import { useMeetingStore } from '../stores/meetingStore';
import { useGlobalTrackerActivity } from '../hooks/useGlobalTrackerActivity';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  useGlobalTrackerActivity();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { totalUnreadCount, fetchUnreadCount } = useChatStore();

  const [showNavBlockerModal, setShowNavBlockerModal] = useState(false);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);

  const { durationLimitReached, extendMeeting, endRoom, dismissDurationWarning } = useMeetingStore();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const activeMeeting = useMeetingStore.getState().meeting;
    const isMinimized = useMeetingStore.getState().minimized;
    if (activeMeeting && !isMinimized && location.pathname.startsWith('/meeting-room/')) {
      e.preventDefault();
      setPendingNavHref(href);
      setShowNavBlockerModal(true);
    }
  };

  // Initialize real-time notifications
  useNotifications();

  useEffect(() => {
    if (!user?.id) return;

    teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => {});

    const interval = window.setInterval(() => {
      teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => {});
    }, 30000);

    const handleOnlineStatus = () => {
      teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => {});
    };
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchUnreadCount();
      
      const interval = setInterval(fetchUnreadCount, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.id, fetchUnreadCount]);

  const activityCountsRef = useRef({ keyboard: 0, mouse: 0, scroll: 0 });
  const flushIntervalRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const trackingActiveRef = useRef<boolean>(false);
  const startAtRef = useRef<string | null>(null);
  const projectIdRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef<Date | null>(null);
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

  // Global timer ticker (for tracking status only)
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
    { name: 'Chat', href: '/chat', icon: MessageSquare },
    { name: 'Meetings', href: '/meetings', icon: Video },
    ...(user?.role === 'employee' ? [
      { name: 'Time Tracking', href: '/time-tracking', icon: Timer },
      ...(!trackingOn ? [{ name: 'Timesheets', href: '/timesheets', icon: User }] : [])
    ] : []),
  ];

  const adminNavigation = [
    { name: 'Employees', href: '/employees', icon: Users },
    { name: 'Team Center', href: '/team-availability', icon: Users },
    { name: 'Timesheets', href: '/timesheets', icon: User },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    // Check if tracking is active
    try {
      const raw = localStorage.getItem('tt-tracker');
      const win = window as any;
      const coreRunning = win.__tt_core?.isTracking;
      
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.isTracking || coreRunning) {
          alert('You cannot logout while the time tracker is running. Please stop the tracker first.');
          return;
        }
      } else if (coreRunning) {
        alert('You cannot logout while the time tracker is running. Please stop the tracker first.');
        return;
      }
    } catch { void 0; }

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
    const w = window as any;
    const ipcRenderer = w.ipcRenderer || (typeof w.require === 'function' ? w.require('electron').ipcRenderer : null);
    if (ipcRenderer) {
      
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
            void e;
          }
        }
        
        // Remove tracker state
        localStorage.removeItem('tt-tracker');

        try {
          // Explicitly mark offline immediately instead of waiting for 3-minute heartbeat timeout
          await teamAvailabilityAPI.updateStatus('offline');
        } catch (e) {
          void e;
        }
        
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
    <div className="h-screen bg-gray-50 flex overflow-hidden">
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
              <img src="/tracker_logo.png" alt="Tracker Logo" className="h-20 w-auto" />
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
                  } group flex items-center w-full px-2 py-2 text-base font-medium rounded-md`}
                  onClick={(e) => {
                    handleLinkClick(e, item.href);
                    if (!showNavBlockerModal) setSidebarOpen(false);
                  }}
                >
                  <item.icon className="mr-4 h-6 w-6" />
                  <span className="flex-1 text-left">{item.name}</span>
                  {item.name === 'Chat' && totalUnreadCount > 0 && (
                    <span className="ml-auto inline-block py-0.5 px-2 text-xs font-semibold rounded-full bg-indigo-600 text-white">
                      {totalUnreadCount}
                    </span>
                  )}
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
                      onClick={(e) => {
                        handleLinkClick(e, item.href);
                        if (!showNavBlockerModal) setSidebarOpen(false);
                      }}
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
                className="ml-2 flex-shrink-0 bg-white rounded-full p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <LogOut className="h-5 w-5" />
              </button>
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
                <img src="/tracker_logo.png" alt="Tracker Logo" className="h-20 w-auto" />
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
                    } group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md`}
                    onClick={(e) => handleLinkClick(e, item.href)}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    <span className="flex-1 text-left">{item.name}</span>
                    {item.name === 'Chat' && totalUnreadCount > 0 && (
                      <span className="ml-auto inline-block py-0.5 px-2 text-xs font-semibold rounded-full bg-indigo-600 text-white">
                        {totalUnreadCount}
                      </span>
                    )}
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
                        onClick={(e) => handleLinkClick(e, item.href)}
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
                  className="ml-2 flex-shrink-0 bg-white rounded-full p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {/* Top header bar */}
        <div className="relative z-10 flex-shrink-0 flex h-14 bg-white border-b border-gray-200 shadow-sm">
          <div className="lg:hidden pl-1 flex items-center">
            <button
              className="h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-end px-4 gap-3">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-2 text-sm">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="leading-tight">
                <p className="font-medium text-gray-700 text-xs">{user?.name}</p>
                <p className="text-[10px] text-gray-400 capitalize">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
        <main className="flex-1 relative z-0 overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
        <JoinMeetingPopup />
        <MeetingBackgroundBar />
      </div>

      {showNavBlockerModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-center text-white">
            <h3 className="text-base font-black mb-2 text-indigo-400">Active Meeting Room</h3>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              You are currently in a meeting. Do you want to leave the meeting or stay on this page?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setShowNavBlockerModal(false);
                  const mStore = useMeetingStore.getState();
                  mStore.setMinimized(true);
                  if (pendingNavHref) navigate(pendingNavHref);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-extrabold text-xs transition border border-indigo-500/30 shadow-lg"
              >
                Keep in Background
              </button>
              <button
                onClick={() => {
                  setShowNavBlockerModal(false);
                  const mStore = useMeetingStore.getState();
                  mStore.leaveRoom();
                  if (pendingNavHref) navigate(pendingNavHref);
                }}
                className="w-full py-2.5 rounded-xl bg-red-655 hover:bg-red-700 font-extrabold text-xs transition shadow-lg"
              >
                Leave Meeting
              </button>
              <button
                onClick={() => {
                  setShowNavBlockerModal(false);
                  setPendingNavHref(null);
                }}
                className="w-full py-2.5 rounded-xl bg-gray-850 hover:bg-gray-800 font-extrabold text-xs text-gray-300 border border-gray-800 transition"
              >
                Stay on Page
              </button>
            </div>
          </div>
        </div>
      )}

      {durationLimitReached && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden p-6 text-center text-white">
            <h3 className="text-base font-black mb-2 text-indigo-400">Meeting Duration Reached</h3>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              Would you like to end the meeting or extend the meeting time?
            </p>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => extendMeeting(15)}
                  className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-extrabold text-xs transition border border-indigo-500/30"
                >
                  Extend by 15 mins
                </button>
                <button
                  onClick={() => extendMeeting(30)}
                  className="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-extrabold text-xs transition border border-indigo-500/30"
                >
                  Extend by 30 mins
                </button>
              </div>
              <button
                onClick={() => endRoom()}
                className="w-full py-2.5 rounded-xl bg-red-655 hover:bg-red-700 font-extrabold text-xs transition shadow-lg"
              >
                End Meeting
              </button>
              <button
                onClick={() => dismissDurationWarning()}
                className="w-full py-2.5 rounded-xl bg-gray-850 hover:bg-gray-800 font-extrabold text-xs text-gray-300 border border-gray-800 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
