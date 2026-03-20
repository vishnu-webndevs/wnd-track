import { api } from '../lib/api';

export interface SyncTimeLogPayload {
  project_id: number;
  task_id?: number;
  start_time: string;
  end_time?: string;
  duration?: number; // minutes
  description?: string;
  desktop_app_id: string; // 'web'
  use_server_time?: boolean;
}

export interface ActivityPayload {
  project_id: number;
  activity_type: string;
  window_title?: string;
  application_name?: string;
  url?: string;
  started_at: string;
  ended_at?: string;
  duration?: number; // seconds or count
  desktop_app_id: string; // 'web'
  keyboard_count?: number;
  mouse_click_count?: number;
  mouse_scroll_count?: number;
}

export interface ActivityMinute {
  time: string;
  keyboard_clicks: number;
  mouse_clicks: number;
  mouse_scrolls: number;
  mouse_movements: number;
  total_activity: number;
  timestamp: string;
}

export const timeTrackingAPI = {
  syncTimeLog: async (payload: SyncTimeLogPayload) => {
    const res = await api.post('/desktop/time-log', payload);
    return res.data.time_log;
  },
  updateTimeLog: async (id: number, payload: Partial<SyncTimeLogPayload>) => {
    const res = await api.put(`/desktop/time-log/${id}`, payload);
    return res.data.time_log;
  },
  uploadScreenshot: async (project_id: number, file: File, captured_at: string, minute_breakdown?: ActivityMinute[], time_log_id?: number) => {
    const form = new FormData();
    form.append('project_id', String(project_id));
    form.append('screenshot', file);
    form.append('captured_at', captured_at);
    form.append('desktop_app_id', 'web');
    if (minute_breakdown) {
      form.append('minute_breakdown', JSON.stringify(minute_breakdown));
    }
    if (time_log_id) {
      form.append('time_log_id', String(time_log_id));
    }
    const res = await api.post('/desktop/screenshot', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  syncActivityLog: async (payload: ActivityPayload) => {
    const res = await api.post('/desktop/activity-log', payload);
    return res.data.activity_log;
  },
  getActiveProjects: async (): Promise<{ id: number; name: string; status: string }[]> => {
    const res = await api.get('/desktop/active-projects');
    return res.data;
  },
  getUserTimeLogs: async (filters: { start_date?: string; end_date?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const res = await api.get(`/desktop/time-logs?${params.toString()}`);
    return res.data;
  },
  getUserScreenshots: async (filters: { start_date?: string; end_date?: string; project_id?: number } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== null) params.append(k, String(v)); });
    const res = await api.get(`/desktop/screenshots?${params.toString()}`);
    return res.data;
  },
  getUserTimeLogsAdmin: async (userId: number, filters: { start_date?: string; end_date?: string } = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.append(k, v); });
    const res = await api.get(`/users/${userId}/time-logs?${params.toString()}`);
    return res.data;
  },
  addManualTimeLog: async (userId: number, data: { project_id: number | null; task_id?: number | null; start_time: string; end_time: string; description?: string }) => {
    const res = await api.post(`/users/${userId}/time-logs`, data);
    return res.data;
  },
  getUserScreenshotsAdmin: async (
    userId: number,
    filters: { start_date?: string; end_date?: string; project_id?: number; time_log_id?: number } = {}
  ) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== null) params.append(k, String(v)); });
    const res = await api.get(`/users/${userId}/screenshots?${params.toString()}`);
    return res.data;
  },
  deleteScreenshot: async (userId: number, screenshotId: number) => {
    const res = await api.delete(`/users/${userId}/screenshots/${screenshotId}`);
    return res.data;
  },
  getUserActivitySummaryAdmin: async (
    userId: number,
    filters: { start_time: string; end_time: string }
  ): Promise<Array<{
    minute: string;
    app_focus: number;
    window_switch: number;
    idle: number;
    active: number;
    mouse_click: number;
    keyboard_input: number;
    scroll: number;
    total: number;
  }>> => {
    const params = new URLSearchParams();
    params.append('start_time', filters.start_time);
    params.append('end_time', filters.end_time);
    const res = await api.get(`/users/${userId}/activity-summary?${params.toString()}`);
    return res.data;
  },
};
