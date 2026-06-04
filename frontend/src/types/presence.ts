export type PresenceStatus = 'available' | 'working' | 'paused' | 'offline';

export interface UserPresence {
  id: number;
  user_id: number;
  status: PresenceStatus;
  current_project_id: number | null;
  current_task_id: number | null;
  tracking_started_at: string | null;
  last_activity_at: string | null;
  internet_connected: boolean;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
  idle_no_movement_minutes_today?: number;
  idle_no_movement_streaks_today?: number;
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    department: string | null;
    position: string | null;
  };
  current_project?: {
    id: number;
    name: string;
  } | null;
  current_task?: {
    id: number;
    title: string;
  } | null;
}

export interface PresenceFilters {
  status?: string;
  project_id?: string;
  department?: string;
  search?: string;
}
