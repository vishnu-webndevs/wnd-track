import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../stores/notificationStore';
import NotificationPanel from './NotificationPanel';

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { unreadCount } = useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Close panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        aria-label="Notifications"
        id="notification-bell"
      >
        <Bell className="h-5 w-5" />

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel dropdown */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-96 max-h-[32rem] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50"
          style={{ animation: 'fadeInScale 0.15s ease-out' }}
        >
          <NotificationPanel onClose={() => setIsOpen(false)} />
        </div>
      )}

      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
