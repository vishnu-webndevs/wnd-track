export interface NotificationData {
  id: number;
  type: string;
  category: 'tracking' | 'user' | 'network' | 'work' | 'meeting' | 'communication';
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  icon: string | null;
  sender: {
    id: number;
    name: string;
  } | null;
  is_read?: boolean;
  created_at: string;
}

export interface NotificationPreferences {
  [category: string]: {
    in_app: boolean;
    desktop: boolean;
    telegram: boolean;
    email: boolean;
  };
}

export type NotificationCategory = 'all' | 'tracking' | 'user' | 'network' | 'work' | 'meeting' | 'communication';

export const NOTIFICATION_CATEGORIES: { value: NotificationCategory; label: string; emoji: string }[] = [
  { value: 'all', label: 'All', emoji: '🔔' },
  { value: 'tracking', label: 'Tracking', emoji: '⏱️' },
  { value: 'user', label: 'Users', emoji: '👤' },
  { value: 'work', label: 'Work', emoji: '📋' },
  { value: 'meeting', label: 'Meetings', emoji: '📅' },
  { value: 'communication', label: 'Chat', emoji: '💬' },
  { value: 'network', label: 'Network', emoji: '🌐' },
];
