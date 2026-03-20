import { api } from '../lib/api';
import { User, Project, Task } from '../types';

export interface UserFilters {
  search?: string;
  role?: 'admin' | 'employee';
  status?: 'active' | 'inactive';
  department?: string;
  page?: number;
  per_page?: number;
}

type SignalObject = Record<string, unknown>;

export const usersAPI = {
  getUsers: async (filters: UserFilters = {}): Promise<{ data: User[]; current_page: number; last_page: number }> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value.toString());
    });
    
    const response = await api.get(`/users?${params}`);
    return response.data;
  },

  getUser: async (id: number): Promise<User> => {
    const response = await api.get(`/users/${id}`);
    return response.data.user;
  },

  createUser: async (data: Partial<User>): Promise<User> => {
    const response = await api.post('/users', data);
    return response.data.user;
  },

  updateUser: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await api.put(`/users/${id}`, data);
    return response.data.user;
  },

  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/users/${id}`);
  },

  resetPassword: async (id: number, password: string, password_confirmation: string): Promise<void> => {
    await api.post(`/users/${id}/reset-password`, { password, password_confirmation });
  },

  triggerLive: async (id: number): Promise<void> => {
    await api.post(`/users/${id}/trigger-live`);
  },

  stopLive: async (id: number): Promise<void> => {
    await api.post(`/users/${id}/stop-live`);
  },

  checkLiveStatus: async (): Promise<{ live_mode: boolean; offer?: { sdp: string } | string | null }> => {
    const response = await api.get('/user/live-status');
    return response.data;
  },

  signal: async (
    id: number,
    data:
      | { type: 'offer'; sdp: string | SignalObject }
      | { type: 'answer'; sdp: string | SignalObject }
      | { type: 'candidate'; candidate: RTCIceCandidateInit | string | SignalObject }
  ): Promise<void> => {
    await api.post(`/users/${id}/signal`, data);
  },

  getSignal: async (
    id: number,
    type: 'offer' | 'answer' | 'candidate'
  ): Promise<unknown> => {
    const response = await api.get(`/users/${id}/signal?type=${type}`);
    return response.data as unknown;
  },

  getAssignedProjects: async (id: number): Promise<Project[]> => {
    const response = await api.get(`/users/${id}/assigned-projects`);
    return response.data;
  },

  getAssignedProjectTasks: async (userId: number, projectId: number): Promise<Task[]> => {
    const response = await api.get(`/users/${userId}/projects/${projectId}/assigned-tasks`);
    return response.data;
  },
};
