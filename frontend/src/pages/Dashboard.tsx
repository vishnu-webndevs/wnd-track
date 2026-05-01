import { useQuery } from '@tanstack/react-query';
import { Users, Briefcase, CheckCircle, Clock, TrendingUp, Timer } from 'lucide-react';
import { dashboardAPI } from '../api/dashboard';
import { useAuthStore } from '../stores/authStore';
import LoadingSpinner from '../components/LoadingSpinner';
import { useState, useEffect } from 'react';

export default function Dashboard() {
  const { user } = useAuthStore();
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
  });

  if (isLoading) {
    return <LoadingSpinner size="lg" className="h-64" />;
  }

  const statCards = [
    {
      name: 'Total Projects',
      value: stats?.totalProjects || 0,
      icon: Briefcase,
    },
    {
      name: 'Active Projects',
      value: stats?.activeProjects || 0,
      icon: TrendingUp,
    },
    {
      name: 'Total Tasks',
      value: stats?.totalTasks || 0,
      icon: CheckCircle,
    },
    {
      name: 'Completed Tasks',
      value: stats?.completedTasks || 0,
      icon: CheckCircle,
    },
    {
      name: 'Total Clients',
      value: stats?.totalClients || 0,
      icon: Users,
    },
    {
      name: 'Active Clients',
      value: stats?.activeClients || 0,
      icon: Users,
    },
    {
      name: 'Active Employees',
      value: stats?.activeEmployees || 0,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.name}!
        </h1>
        <div className="text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </div>

      {/* Active Tracking Status */}
      {activeTracking && (
        <div className="bg-indigo-600 rounded-lg shadow-md p-4 text-white flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-500 p-2 rounded-full">
              <Timer className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-indigo-100 uppercase font-semibold">Currently Tracking</p>
              <h2 className="text-lg font-bold">{activeTracking.taskTitle || 'Working...'}</h2>
              <p className="text-sm text-indigo-100">{activeTracking.projectName || 'Active Project'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-indigo-100 uppercase">Started At</p>
            <p className="text-sm font-medium">{activeTracking.startAt ? new Date(activeTracking.startAt).toLocaleTimeString() : '-'}</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.name}
            className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <card.icon className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {card.name}
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {card.value}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Projects */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Projects
            </h3>
            <div className="space-y-4">
              {stats?.recentProjects?.slice(0, 5).map((project) => (
                <div key={project.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {project.name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {project.client?.name}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      project.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : project.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : project.status === 'on_hold'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {project.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              )) || (
                <div className="text-center text-gray-500 py-4">
                  No recent projects
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Tasks
            </h3>
            <div className="space-y-4">
              {stats?.recentTasks?.slice(0, 5).map((task) => (
                <div key={task.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {task.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {task.project?.name}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      task.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : task.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {task.status.toUpperCase()}
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

      {/* Overdue Tasks */}
      {stats?.overdueTasks && stats.overdueTasks.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
              <Clock className="h-5 w-5 text-red-500 mr-2" />
              Overdue Tasks
            </h3>
            <div className="space-y-3">
              {stats.overdueTasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-red-50 rounded-md">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.title}</p>
                    <p className="text-sm text-gray-600">
                      {task.project?.name} • Due: {new Date(task.due_date!).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    OVERDUE
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
