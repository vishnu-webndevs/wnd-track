import { create } from 'zustand';
import type { NotificationData, NotificationCategory } from '../types/notifications';
import { notificationsAPI } from '../api/notifications';

interface NotificationState {
  notifications: NotificationData[];
  unreadCount: number;
  activeCategory: NotificationCategory;
  isLoading: boolean;
  hasMore: boolean;
  currentPage: number;

  // Actions
  setActiveCategory: (category: NotificationCategory) => void;
  addNotification: (notification: NotificationData) => void;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  fetchNotifications: (reset?: boolean) => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  activeCategory: 'all',
  isLoading: false,
  hasMore: true,
  currentPage: 1,

  setActiveCategory: (category) => {
    set({ activeCategory: category, notifications: [], currentPage: 1, hasMore: true });
    get().fetchNotifications(true);
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications.filter((n) => n.id !== notification.id)],
    }));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),

  incrementUnreadCount: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),

  fetchNotifications: async (reset = false) => {
    const { isLoading, activeCategory } = get();
    if (isLoading) return;

    set({ isLoading: true });

    try {
      const page = reset ? 1 : get().currentPage;
      const params: Record<string, unknown> = {
        page,
        per_page: 20,
        is_read: false, // Only fetch unread notifications
      };
      if (activeCategory !== 'all') {
        params.category = activeCategory;
      }

      const response = await notificationsAPI.getNotifications(params as never);

      set((state) => ({
        notifications: reset ? response.data : [...state.notifications, ...response.data],
        currentPage: page + 1,
        hasMore: response.meta.current_page < response.meta.last_page,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const count = await notificationsAPI.getUnreadCount();
      set({ unreadCount: count });
    } catch {
      // silently fail
    }
  },

  markRead: async (id) => {
    try {
      await notificationsAPI.markRead(id);
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // silently fail
    }
  },

  markAllRead: async () => {
    try {
      await notificationsAPI.markAllRead();
      set((state) => ({
        notifications: [],
        unreadCount: 0,
      }));
    } catch {
      // silently fail
    }
  },
}));
