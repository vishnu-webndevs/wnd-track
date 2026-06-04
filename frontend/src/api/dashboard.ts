import { api } from '../lib/api';
import { DashboardStats } from '../types';

export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard');
    const data = response.data;
    // Map backend shape to frontend DashboardStats
    const statsBlock = data.stats || {};
    return {
      totalProjects: statsBlock.total_projects ?? 0,
      activeProjects: statsBlock.active_projects ?? 0,
      totalTasks: statsBlock.total_tasks ?? 0,
      completedTasks: statsBlock.completed_tasks ?? statsBlock.in_progress_tasks ?? 0, // fallback
      totalClients: statsBlock.total_clients ?? 0,
      activeClients: data.project_status_counts ? (data.project_status_counts.in_progress ?? 0) : 0,
      totalEmployees: statsBlock.total_employees ?? 0,
      activeEmployees: statsBlock.total_employees ?? 0,
      recentProjects: data.recent_projects ?? [],
      recentTasks: data.recent_tasks ?? [],
      overdueTasks: [],
      todayHours: statsBlock.today_hours ?? 0,
      todayMinutes: statsBlock.today_minutes ?? 0,
      // Extended properties
      onlineEmployees: statsBlock.online_employees ?? 0,
      availableEmployees: statsBlock.available_employees ?? 0,
      activeTrackers: statsBlock.active_trackers ?? 0,
      offlineEmployees: statsBlock.offline_employees ?? 0,
      upcomingMeetings: statsBlock.upcoming_meetings ?? 0,
      liveMeetings: statsBlock.live_meetings ?? 0,
      unreadMessages: statsBlock.unread_messages ?? 0,
      pendingNotifications: statsBlock.pending_notifications ?? 0,
      upcomingMeetingsList: data.upcoming_meetings_list ?? [],
      activeMeetingsList: data.active_meetings_list ?? [],
    };
  },
};
