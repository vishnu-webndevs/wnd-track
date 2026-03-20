import { api } from '../lib/api';
import { Client } from '../types';

export interface ClientFilters {
  search?: string;
  status?: 'active' | 'inactive';
  page?: number;
}

export const clientsAPI = {
  getClients: async (filters: ClientFilters = {}): Promise<{ data: Client[]; current_page: number; last_page: number }> => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value.toString());
    });
    const response = await api.get(`/clients?${params}`);
    return response.data;
  },

  getClient: async (id: number): Promise<Client> => {
    const response = await api.get(`/clients/${id}`);
    return response.data.client;
  },

  createClient: async (data: Partial<Client> & { email: string; name: string }): Promise<Client> => {
    const response = await api.post('/clients', data);
    return response.data.client;
  },

  updateClient: async (id: number, data: Partial<Client>): Promise<Client> => {
    const response = await api.put(`/clients/${id}`, data);
    return response.data.client;
  },

  deleteClient: async (id: number): Promise<void> => {
    await api.delete(`/clients/${id}`);
  },
};

