import { useEffect, useRef } from 'react';
import { getEcho, disconnectEcho } from '../lib/echo';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';
import type { NotificationData } from '../types/notifications';
import { useVoiceStore } from '../stores/voiceStore';
import { useChatStore } from '../stores/chatStore';
import { useMeetingInviteStore } from '../stores/meetingInviteStore';
import { toast } from 'sonner';

/**
 * Hook that subscribes to real-time notifications via WebSocket
 * and triggers desktop notifications when appropriate.
 */
export function useNotifications() {
  const { user, isAuthenticated } = useAuthStore();
  const { addNotification, incrementUnreadCount, fetchUnreadCount, fetchNotifications } = useNotificationStore();
  const channelRef = useRef<ReturnType<ReturnType<typeof getEcho>['private']> | null>(null);
  const initializedRef = useRef(false);

  // Listen for native Electron notification clicks
  useEffect(() => {
    const w = window as unknown as {
      require?: (name: 'electron') => {
        ipcRenderer: {
          on: (channel: string, listener: (...args: any[]) => void) => void;
          removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        };
      };
    };

    if (typeof w.require === 'function') {
      try {
        const { ipcRenderer } = w.require('electron');
        const handleIpcClick = (_event: any, notificationData: any) => {
          if (notificationData) {
            const { data: innerData, type } = notificationData;
            if (innerData) {
              const { conversation_id, meeting_id } = innerData;
              if (conversation_id) {
                useChatStore.getState().setActiveConversationId(Number(conversation_id));
                window.location.hash = '#/chat';
                return;
              } else if (meeting_id) {
                window.location.hash = `#/meeting-room/${meeting_id}`;
                return;
              }
            }
            if (type === 'meeting_created' || type === 'meeting_reminder' || type === 'meeting_started') {
              window.location.hash = '#/meetings';
            } else if (type === 'chat_message') {
              window.location.hash = '#/chat';
            }
          }
        };
        
        ipcRenderer.on('notification-clicked', handleIpcClick);
        return () => {
          ipcRenderer.removeListener('notification-clicked', handleIpcClick);
        };
      } catch (e) {
        void e;
      }
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      // Cleanup if user logs out
      if (channelRef.current) {
        channelRef.current = null;
        disconnectEcho();
      }
      initializedRef.current = false;
      return;
    }

    // Request notification permission early
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => void 0);
    }

    // Fetch initial data
    if (!initializedRef.current) {
      fetchUnreadCount();
      fetchNotifications(true);
      initializedRef.current = true;
    }

    // Subscribe to private notification channel
    try {
      const echo = getEcho();
      const channelName = `notifications.${user.id}`;
      const channel = echo.private(channelName);

      channel.listen('.notification.created', (data: NotificationData) => {
        // Add to store
        addNotification({ ...data, is_read: false });
        incrementUnreadCount();

        // Show a toast so user can immediately see it
        toast(data.title, {
          description: data.message,
          icon: data.icon || '🔔',
          action: {
            label: 'View',
            onClick: () => {
              // Handle notification click here if needed
            },
          },
        });

        // Check if the notification is for the active conversation
        const activeConversationId = useChatStore.getState().activeConversationId;
        const isCurrentChat = data.type === 'chat_message' && data.data && Number(data.data.conversation_id) === Number(activeConversationId);

        // If meeting started, trigger global popup invite
        if (data.type === 'meeting_started' && data.data && data.data.meeting_id) {
          useMeetingInviteStore.getState().setInvite({
            meetingId: Number(data.data.meeting_id),
            title: data.title || 'Live Meeting',
            hostName: data.sender?.name || 'Organizer'
          });
        }

        // Trigger desktop notification only if not currently in this chat
        if (!isCurrentChat) {
          triggerDesktopNotification(data);
        }
      });

      channel.listen('.call.incoming', (data: { session_id: string; caller_id: number; caller_name: string; type: string }) => {
        useVoiceStore.getState().receiveCall(data.session_id, data.caller_id, data.caller_name);
        
        triggerDesktopNotification({
          title: 'Incoming Call',
          message: `${data.caller_name} is calling you...`,
          type: 'system',
        });
      });

      // Handle chat management events
      channel.listen('.conversation.deleted', (data: { conversationId: number }) => {
        useChatStore.getState().removeConversation(data.conversationId);
      });

      channel.listen('.chat.cleared', (data: { conversationId: number }) => {
        useChatStore.getState().clearMessages(data.conversationId);
      });

      channel.listen('.participant.added', (data: { conversationId: number; addedUsers: any[] }) => {
        useChatStore.getState().addGroupParticipants(data.conversationId, data.addedUsers);
      });

      channel.listen('.participant.removed', (data: { conversationId: number; removedUserId: number }) => {
        const currentUser = useAuthStore.getState().user;
        if (currentUser && data.removedUserId === currentUser.id) {
          useChatStore.getState().removeConversation(data.conversationId);
        } else {
          useChatStore.getState().removeGroupParticipant(data.conversationId, data.removedUserId);
        }
      });

      channelRef.current = channel;
    } catch (e) {
      void e;
      // Fallback: poll every 30 seconds
      const pollInterval = setInterval(() => {
        fetchUnreadCount();
      }, 30000);

      return () => clearInterval(pollInterval);
    }

    return () => {
      if (channelRef.current) {
        try {
          const echo = getEcho();
          echo.leave(`notifications.${user.id}`);
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id, addNotification, incrementUnreadCount, fetchUnreadCount, fetchNotifications]);
}

/**
 * Trigger a desktop notification using either Electron's native API or the Web Notifications API.
 */
export function triggerDesktopNotification(data: Partial<NotificationData> & { title: string; message: string }) {
  const title = data.title || 'WND Tracker';
  const body = data.message || '';

  // Check if running in Electron
  const w = window as unknown as {
    require?: (name: 'electron') => {
      ipcRenderer: { send: (channel: string, ...args: unknown[]) => void };
    };
  };

  const handleNotificationClick = () => {
    if (typeof w.require === 'function') {
      try {
        const { ipcRenderer } = w.require!('electron');
        ipcRenderer.send('focus-window');
      } catch (e) {
        void e;
      }
    }
    window.focus();

    // Navigate to relevant route
    if (data.data) {
      const { conversation_id, meeting_id } = data.data;
      if (conversation_id) {
        useChatStore.getState().setActiveConversationId(Number(conversation_id));
        window.location.hash = '#/chat';
      } else if (meeting_id) {
        window.location.hash = `#/meeting-room/${meeting_id}`;
      } else if (data.type === 'meeting_created' || data.type === 'meeting_reminder' || data.type === 'meeting_started') {
        window.location.hash = '#/meetings';
      }
    } else if (data.type === 'chat_message') {
      window.location.hash = '#/chat';
    }
  };

  if (typeof w.require === 'function') {
    // Electron environment - use native IPC notification to main process
    try {
      const { ipcRenderer } = w.require!('electron');
      ipcRenderer.send('show-notification', { title, body, data });
    } catch (e) {
      void e;
      try {
        const notification = new Notification(title, {
          body,
          icon: '/tracker_logo.png',
          silent: false,
          requireInteraction: true, // Keep notification visible until user interacts
        });
        notification.onclick = handleNotificationClick;
      } catch (err) {
        void err;
      }
    }
    return;
  }

  // Browser environment - use Web Notifications API
  if ('Notification' in window) {
    const showNotification = () => {
      try {
        const notification = new Notification(title, {
          body,
          icon: '/tracker_logo.png',
          requireInteraction: true, // Keep visible until user clicks it (like WhatsApp!)
          silent: false,
        });
        notification.onclick = handleNotificationClick;
        notification.onerror = () => void 0;
      } catch (err) {
        void err;
      }
    };

    if (Notification.permission === 'granted') {
      showNotification();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          showNotification();
        }
      });
    }
  }
}
