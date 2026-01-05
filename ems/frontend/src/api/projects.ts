import { api } from '../lib/api';
import type { Project } from '../types';

export interface ProjectFilters {
  search?: string;
  status?: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  client_id?: number;
  manager_id?: number;
  page?: number;
}

export const projectsAPI = {
  getProjects: async (
    filters: ProjectFilters = {}
  ): Promise<{ data: Project[]; current_page: number; last_page: number }> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
    const response = await api.get(`/projects?${params.toString()}`);
    return response.data;
  },

  getProject: async (id: number): Promise<Project> => {
    const response = await api.get(`/projects/${id}`);
    return response.data.project;
  },

  createProject: async (
    data: Partial<Project> & {
      name: string;
      client_id: number;
    }
  ): Promise<Project> => {
    const response = await api.post('/projects', data);
    return response.data.project;
  },

  updateProject: async (id: number, data: Partial<Project>): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, data);
    return response.data.project;
  },

  deleteProject: async (id: number): Promise<void> => {
    await api.delete(`/projects/${id}`);
  },

  getActiveProjects: async (): Promise<Project[]> => {
    const response = await api.get('/projects/active');
    return response.data;
  },
};

