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
    };
  },
};
