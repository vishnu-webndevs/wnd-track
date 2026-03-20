import { api } from '../lib/api';
import type { Task } from '../types';

export interface TaskFilters {
  search?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  exclude_status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  project_id?: number;
  assigned_to?: number;
  created_by?: number;
  page?: number;
}

export const tasksAPI = {
  getTasks: async (
    filters: TaskFilters = {}
  ): Promise<{ data: Task[]; current_page: number; last_page: number }> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await api.get(`/tasks?${params.toString()}`);
    return response.data;
  },

  getTask: async (id: number): Promise<Task> => {
    const response = await api.get(`/tasks/${id}`);
    return response.data.task ?? response.data;
  },

  createTask: async (
    data: Partial<Task> & {
      title: string;
      project_id: number;
    }
  ): Promise<Task> => {
    const response = await api.post('/tasks', data);
    return response.data.task;
  },

  updateTask: async (id: number, data: Partial<Task>): Promise<Task> => {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data.task ?? response.data;
  },

  deleteTask: async (id: number): Promise<void> => {
    await api.delete(`/tasks/${id}`);
  },

  getTasksByProject: async (projectId: number): Promise<Task[]> => {
    const response = await api.get(`/projects/${projectId}/tasks`);
    return response.data;
  },

  getTasksByUser: async (userId: number): Promise<Task[]> => {
    const response = await api.get(`/users/${userId}/tasks`);
    return response.data;
  },

  updateStatus: async (
    id: number,
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<Task> => {
    const response = await api.patch(`/tasks/${id}/status`, { status });
    return response.data.task ?? response.data;
  },

  reorder: async (
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled',
    ids: number[]
  ): Promise<void> => {
    await api.post('/tasks/reorder', { status, ids });
  },
};
