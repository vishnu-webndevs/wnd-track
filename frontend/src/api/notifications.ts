import { api } from '../lib/api';
import type { NotificationData, NotificationPreferences } from '../types/notifications';

export interface NotificationListParams {
  page?: number;
  per_page?: number;
  category?: string;
  is_read?: boolean;
  search?: string;
}

export interface NotificationListResponse {
  success: boolean;
  data: NotificationData[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export const notificationsAPI = {
  getNotifications: async (params: NotificationListParams = {}): Promise<NotificationListResponse> => {
    const response = await api.get('/notifications', { params });
    return response.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const response = await api.get('/notifications/unread-count');
    return response.data.count;
  },

  markRead: async (id: number): Promise<void> => {
    await api.put(`/notifications/${id}/read`);
  },

  markAllRead: async (): Promise<void> => {
    await api.put('/notifications/read-all');
  },

  getPreferences: async (): Promise<NotificationPreferences> => {
    const response = await api.get('/notifications/preferences');
    return response.data.data;
  },

  updatePreferences: async (preferences: NotificationPreferences): Promise<NotificationPreferences> => {
    const response = await api.put('/notifications/preferences', { preferences });
    return response.data.data;
  },

  logNotification: async (data: {
    type: string;
    category: string;
    title: string;
    message: string;
    icon?: string;
  }): Promise<void> => {
    await api.post('/notifications/log', data);
  },

  broadcastNotification: async (data: {
    message: string;
    user_ids?: number[];
  }): Promise<void> => {
    await api.post('/notifications/broadcast', data);
  },
};
