import { useEffect, useRef, useCallback } from 'react';
import { Check, CheckCheck, Loader2, Bell } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import { NOTIFICATION_CATEGORIES } from '../types/notifications';
import type { NotificationData, NotificationCategory } from '../types/notifications';

interface NotificationPanelProps {
  onClose: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'tracking': return 'bg-blue-100 text-blue-700';
    case 'user': return 'bg-green-100 text-green-700';
    case 'meeting': return 'bg-purple-100 text-purple-700';
    case 'communication': return 'bg-orange-100 text-orange-700';
    case 'work': return 'bg-yellow-100 text-yellow-700';
    case 'network': return 'bg-red-100 text-red-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: NotificationData;
  onMarkRead: (id: number) => void;
}) {
  return (
    <div
      className={`px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0 ${
        !notification.is_read ? 'bg-indigo-50/40' : ''
      }`}
      onClick={() => {
        if (!notification.is_read) {
          onMarkRead(notification.id);
        }
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon / emoji */}
        <div className="flex-shrink-0 mt-0.5">
          <span className="text-lg">{notification.icon || '🔔'}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium truncate ${!notification.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
              {notification.title}
            </p>
            {!notification.is_read && (
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 whitespace-pre-line">
            {notification.message}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryColor(notification.category)}`}>
              {notification.category}
            </span>
            <span className="text-[10px] text-gray-400">
              {formatTimeAgo(notification.created_at)}
            </span>
            {notification.sender && (
              <span className="text-[10px] text-gray-400">
                by {notification.sender.name}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const {
    notifications,
    unreadCount,
    activeCategory,
    isLoading,
    hasMore,
    setActiveCategory,
    fetchNotifications,
    markRead,
    markAllRead,
  } = useNotificationStore();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || isLoading || !hasMore) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchNotifications(false);
    }
  }, [isLoading, hasMore, fetchNotifications]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll);
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  return (
    <div className="flex flex-col h-full max-h-[32rem]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <p className="text-[11px] text-gray-500">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-2 py-2 border-b border-gray-100 flex gap-1 overflow-x-auto scrollbar-hide">
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value as NotificationCategory)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
              activeCategory === cat.value
                ? 'bg-indigo-100 text-indigo-700'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {notifications.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Bell className="h-10 w-10 mb-3 text-gray-300" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">You're all caught up!</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={markRead}
              />
            ))}
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              </div>
            )}
            {!hasMore && notifications.length > 0 && (
              <div className="text-center py-3 text-[11px] text-gray-400">
                No more notifications
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
