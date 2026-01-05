export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department?: string;
  position?: string;
  phone?: string;
  status: 'active' | 'inactive';
  hire_date?: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  website?: string;
  status: 'active' | 'inactive';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  client_id: number;
  client?: Client;
  manager_id?: number;
  manager?: User;
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  start_date?: string;
  end_date?: string;
  budget?: number;
  notes?: string;
  tasks_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  project_id: number;
  project?: Project;
  assigned_to?: number;
  assigned_employee?: User;
  assignedTo?: User;
  createdBy?: User;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
  notes?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TimeLog {
  id: number;
  user_id: number;
  user?: User;
  task_id?: number;
  task?: Task;
  project_id?: number;
  project?: Project;
  start_time: string;
  end_time?: string;
  duration?: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Screenshot {
  id: number;
  user_id: number;
  user?: User;
  time_log_id?: number;
  time_log?: TimeLog;
  file_path: string;
  file_name: string;
  file_size: number;
  captured_at: string;
  url?: string;
  minute_breakdown?: Array<{
    time: string;
    keyboard_clicks: number;
    mouse_clicks: number;
    mouse_scrolls?: number;
    mouse_movements: number;
    total_activity: number;
    timestamp: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  user?: User;
  type: 'app_focus' | 'window_switch' | 'mouse_click' | 'keyboard_input';
  data: Record<string, unknown>;
  timestamp: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  totalClients: number;
  activeClients: number;
  totalEmployees: number;
  activeEmployees: number;
  recentProjects: Project[];
  recentTasks: Task[];
  overdueTasks: Task[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
