import { useQuery } from '@tanstack/react-query';
import { 
  Users, Briefcase, CheckCircle, Clock, TrendingUp, Timer, 
  Video, MessageSquare, Bell, Calendar, UserCheck, UserX, 
  ExternalLink, Play, Sparkles
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { dashboardAPI } from '../api/dashboard';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [activeTracking, setActiveTracking] = useState<{
    isTracking: boolean;
    projectName?: string;
    taskTitle?: string;
    startAt?: string;
  } | null>(null);

  useEffect(() => {
    const checkTracking = () => {
      const raw = localStorage.getItem('tt-tracker');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.isTracking) {
            setActiveTracking(parsed);
          } else {
            setActiveTracking(null);
          }
        } catch {
          setActiveTracking(null);
        }
      } else {
        setActiveTracking(null);
      }
    };

    checkTracking();
    const interval = setInterval(checkTracking, 5000);
    return () => clearInterval(interval);
  }, []);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardAPI.getStats,
    refetchInterval: 15000, // Refresh every 15 seconds to update real-time widgets
  });

  if (isLoading) {
    return <LoadingSpinner size="lg" className="h-64" />;
  }

  const isAdmin = user?.role === 'admin';

  // Standard Stat Cards
  const statCards = [
    {
      name: 'Total Projects',
      value: stats?.totalProjects || 0,
      icon: Briefcase,
      color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/10',
    },
    {
      name: 'Active Projects',
      value: stats?.activeProjects || 0,
      icon: TrendingUp,
      color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/10',
    },
    {
      name: 'Total Tasks',
      value: stats?.totalTasks || 0,
      icon: CheckCircle,
      color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-150 dark:border-gray-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
              Welcome back, {user?.name}!
            </h1>
            <p className="text-sm text-gray-500 capitalize">Role: {user?.role} • Department: {user?.department || 'General'}</p>
          </div>
        </div>
        <div className="text-sm font-bold text-gray-700 bg-gray-50 dark:bg-gray-850 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800">
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* Active Tracking Status */}
      {activeTracking && (
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl shadow-lg p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="bg-indigo-500/30 backdrop-blur p-3 rounded-xl border border-indigo-400/20 animate-pulse">
              <Timer className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-indigo-200 uppercase tracking-widest font-black">Currently Tracking</p>
              <h2 className="text-lg font-black">{activeTracking.taskTitle || 'Working...'}</h2>
              <p className="text-sm text-indigo-200">{activeTracking.projectName || 'Active Project'}</p>
            </div>
          </div>
          <div className="text-right w-full sm:w-auto flex sm:flex-col justify-between items-center sm:items-end border-t sm:border-t-0 border-indigo-500/30 pt-3 sm:pt-0">
            <p className="text-xs text-indigo-200 uppercase tracking-wider font-semibold">Started At</p>
            <p className="text-sm font-bold bg-indigo-900/30 px-3 py-1 rounded-lg border border-indigo-500/20 mt-0.5">
              {activeTracking.startAt ? new Date(activeTracking.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '-'}
            </p>
          </div>
        </div>
      )}

      {/* Admin Workforce Availability Widget */}
      {isAdmin && (
        <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-6 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              Workforce Availability Overview
            </h3>
            <Link 
              to="/team-availability" 
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
            >
              Presence Dashboard <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/10 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400">Online</span>
                <Users className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-2xl font-black text-emerald-900 dark:text-emerald-355">{stats?.onlineEmployees || 0}</span>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/10 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-800 dark:text-blue-400">Available</span>
                <UserCheck className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-2xl font-black text-blue-900 dark:text-blue-355">{stats?.availableEmployees || 0}</span>
            </div>

            <div className="p-4 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/10 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-400">Working (Trackers)</span>
                <Timer className="w-4 h-4 text-indigo-500" />
              </div>
              <span className="text-2xl font-black text-indigo-900 dark:text-indigo-355">{stats?.activeTrackers || 0}</span>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-150 dark:border-gray-800 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-500">Offline</span>
                <UserX className="w-4 h-4 text-gray-400" />
              </div>
              <span className="text-2xl font-black text-gray-700 dark:text-gray-450">{stats?.offlineEmployees || 0}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Communication, Meetings & Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Quick Stats & Communication Counter */}
        <div className="space-y-6 lg:col-span-1">
          {/* Communication Widget */}
          <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-6 rounded-2xl shadow-sm space-y-4">
            <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
              <MessageSquare className="w-5 h-5 text-indigo-650" />
              Communication & Feed
            </h3>
            
            <div className="space-y-3">
              <Link 
                to="/chat" 
                className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-850 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 border border-gray-200 dark:border-gray-800 rounded-xl transition duration-200"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-white">Unread Chat Messages</p>
                    <p className="text-[10px] text-gray-400">Jump back to conversations</p>
                  </div>
                </div>
                {stats?.unreadMessages && stats.unreadMessages > 0 ? (
                  <span className="px-2.5 py-1 text-xs font-black rounded-full bg-indigo-600 text-white animate-bounce">
                    {stats.unreadMessages}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 font-semibold">0</span>
                )}
              </Link>

              <div 
                onClick={() => navigate('/dashboard')} // Trigger notification panel if globally registered
                className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-850 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 border border-gray-200 dark:border-gray-800 rounded-xl transition duration-200 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-800 dark:text-white">Pending Notifications</p>
                    <p className="text-[10px] text-gray-400">Activity and status notifications</p>
                  </div>
                </div>
                {stats?.pendingNotifications && stats.pendingNotifications > 0 ? (
                  <span className="px-2.5 py-1 text-xs font-black rounded-full bg-amber-500 text-white">
                    {stats.pendingNotifications}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 font-semibold">0</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats list */}
          <div className="space-y-4">
            {statCards.map((card) => (
              <div
                key={card.name}
                className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-5 rounded-2xl shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">{card.name}</span>
                </div>
                <span className="text-xl font-black text-gray-900 dark:text-white">{card.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center & Right Column: Meetings and Recent Lists */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Meetings Widget */}
          <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-650" />
                Your Schedule & Live Rooms
              </h3>
              <Link 
                to="/meetings" 
                className="text-xs font-bold text-indigo-650 hover:underline flex items-center gap-1"
              >
                All Meetings <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Live Rooms List */}
            {stats?.activeMeetingsList && stats.activeMeetingsList.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block"></span>
                  Live Meeting Rooms
                </h4>
                {stats.activeMeetingsList.map(meeting => (
                  <div 
                    key={meeting.id} 
                    className="flex justify-between items-center p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-900/30 rounded-xl"
                  >
                    <div>
                      <p className="text-sm font-extrabold text-gray-900 dark:text-white">{meeting.title}</p>
                      <p className="text-xs text-rose-600 dark:text-rose-400">
                        Started by {meeting.creator?.name} • {meeting.participants.length} invitees
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/meeting-room/${meeting.id}`)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-500 hover:bg-rose-650 text-white text-xs font-extrabold rounded-xl shadow-md shadow-rose-500/20 transition transform hover:scale-[1.02]"
                    >
                      <Play className="w-3.5 h-3.5" /> Join Room
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upcoming meetings list */}
            <div className="space-y-3 mt-4">
              <h4 className="text-xs font-black text-indigo-500 uppercase tracking-wider">
                Upcoming Meetings
              </h4>
              {stats?.upcomingMeetingsList && stats.upcomingMeetingsList.length > 0 ? (
                <div className="space-y-2">
                  {stats.upcomingMeetingsList.map(meeting => {
                    const scheduledAt = new Date(meeting.scheduled_at);
                    return (
                      <div 
                        key={meeting.id}
                        className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 rounded-xl text-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 dark:text-white">{meeting.title}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {scheduledAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at {scheduledAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} • {meeting.duration_minutes}m
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          {meeting.type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-850 border border-gray-150 dark:border-gray-800 border-dashed rounded-xl">
                  No upcoming meetings scheduled
                </p>
              )}
            </div>
          </div>

          {/* Recent projects and tasks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Recent Projects */}
            <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base mb-4">
                Recent Projects
              </h3>
              <div className="space-y-4">
                {stats?.recentProjects?.slice(0, 4).map((project) => (
                  <div key={project.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {project.client?.name}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                        project.status === 'completed'
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-450 border border-green-200 dark:border-green-900/10'
                          : project.status === 'in_progress'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-450 border border-blue-200 dark:border-blue-900/10'
                          : 'bg-gray-50 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                )) || (
                  <div className="text-center text-gray-500 py-4">
                    No recent projects
                  </div>
                )}
              </div>
            </div>

            {/* Recent Tasks */}
            <div className="bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-6 rounded-2xl shadow-sm">
              <h3 className="font-extrabold text-gray-900 dark:text-white text-base mb-4">
                Recent Tasks
              </h3>
              <div className="space-y-4">
                {stats?.recentTasks?.slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {task.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {task.project?.name}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                        task.status === 'completed'
                          ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-450 border border-green-200 dark:border-green-900/10'
                          : task.status === 'in_progress'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-450 border border-blue-200 dark:border-blue-900/10'
                          : 'bg-gray-50 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400 border border-gray-200 dark:border-gray-800'
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                )) || (
                  <div className="text-center text-gray-500 py-4">
                    No recent tasks
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
