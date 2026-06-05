import { api } from '../lib/api';
import type { UserPresence, PresenceFilters } from '../types/presence';

export interface TeamAvailabilityResponse {
  success: boolean;
  data: UserPresence[];
}

export interface HeartbeatResponse {
  success: boolean;
  message: string;
}

export interface UpdateStatusResponse {
  success: boolean;
  message: string;
  data: UserPresence;
}

export interface IdleHistoryEntry {
  date: string;
  idle_minutes: number;
  streaks: number;
}

export const teamAvailabilityAPI = {
  getTeamAvailability: async (filters: PresenceFilters = {}): Promise<TeamAvailabilityResponse> => {
    const response = await api.get('/team/availability', { params: filters });
    return response.data;
  },

  sendHeartbeat: async (internetConnected: boolean = true): Promise<HeartbeatResponse> => {
    const response = await api.post('/team/heartbeat', { internet_connected: internetConnected });
    return response.data;
  },

  updateStatus: async (status: 'available' | 'offline'): Promise<UpdateStatusResponse> => {
    const response = await api.post('/team/status', { status });
    return response.data;
  },

  getIdleHistory: async (userId: number, days: number = 14): Promise<{ success: boolean; data: IdleHistoryEntry[] }> => {
    const response = await api.get(`/team/idle-history/${userId}`, { params: { days } });
    return response.data;
  },
};
