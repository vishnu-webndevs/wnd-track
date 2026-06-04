import { useEffect, useState, useRef } from 'react';
import { getEcho } from '../lib/echo';
import { teamAvailabilityAPI } from '../api/teamAvailability';
import type { UserPresence, PresenceFilters } from '../types/presence';
import { useAuthStore } from '../stores/authStore';

export function useTeamPresence(filters: PresenceFilters = {}) {
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, user } = useAuthStore();
  const channelRef = useRef<any>(null);

  // Function to fetch team availability list from API
  const fetchPresenceList = async () => {
    try {
      setLoading(true);
      const res = await teamAvailabilityAPI.getTeamAvailability(filters);
      if (res.success) {
        setPresences(res.data);
      }
      setError(null);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to load team availability.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch when filters change
  useEffect(() => {
    if (isAuthenticated) {
      fetchPresenceList();
    }
  }, [isAuthenticated, filters.status, filters.project_id, filters.department, filters.search]);

  // Setup WebSocket subscription and heartbeat
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    // Send initial heartbeat
    teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => void 0);

    // Heartbeat timer (every 30 seconds)
    const heartbeatInterval = setInterval(() => {
      teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => void 0);
    }, 30000);

    // Bind online/offline window events
    const handleOnlineStatus = () => {
      teamAvailabilityAPI.sendHeartbeat(navigator.onLine).catch(() => void 0);
    };
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Join Echo presence channel
    let echo: any;
    try {
      echo = getEcho();
      const channel = echo.join('team-presence');
      channelRef.current = channel;

      // Handle presence channel events
      channel.here((users: any[]) => {
        // Set online status in our state for users currently connected
        const onlineIds = users.map(u => u.id);
        setPresences(prev =>
          prev.map(p => {
            if (onlineIds.includes(p.user_id)) {
              return { ...p, status: p.status === 'offline' ? 'available' : p.status };
            }
            return p;
          })
        );
      });

      channel.joining((joiningUser: { id: number; name: string }) => {
        setPresences(prev =>
          prev.map(p => {
            if (p.user_id === joiningUser.id) {
              return { ...p, status: p.status === 'offline' ? 'available' : p.status };
            }
            return p;
          })
        );
      });

      channel.leaving((leavingUser: { id: number; name: string }) => {
        setPresences(prev =>
          prev.map(p => {
            if (p.user_id === leavingUser.id) {
              return { ...p, status: 'offline' };
            }
            return p;
          })
        );
      });

      channel.listen('.user.status.changed', (data: any) => {
        setPresences(prev => {
          // If the user presence is already in the list, update it
          const exists = prev.some(p => p.user_id === data.user_id);
          if (exists) {
            return prev.map(p => (p.user_id === data.user_id ? { ...p, ...data } : p));
          }
          // If not in the list, but it matches current filters, refetch or add it
          fetchPresenceList();
          return prev;
        });
      });
    } catch (e) {
      void e;
    }

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      if (channelRef.current && echo) {
        try {
          echo.leave('team-presence');
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
    };
  }, [isAuthenticated, user?.id]);

  return { presences, loading, error, refetch: fetchPresenceList };
}
