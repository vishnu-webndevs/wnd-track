import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export interface ActiveSession {
  id: number;
  device_name: string;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  is_current: boolean;
}

export const sessionsAPI = {
  getSessions: async () => {
    const response = await axios.get<ActiveSession[]>(`${API_URL}/sessions`, {
      withCredentials: true
    });
    return response.data;
  },

  revokeSession: async (id: number) => {
    const response = await axios.delete(`${API_URL}/sessions/${id}`, {
      withCredentials: true
    });
    return response.data;
  }
};
