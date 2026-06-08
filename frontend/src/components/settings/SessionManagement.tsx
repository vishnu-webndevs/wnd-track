import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, ShieldAlert, LogOut, Clock, MapPin } from 'lucide-react';
import { sessionsAPI, ActiveSession } from '../../api/sessions';
import { toast } from 'sonner';

export default function SessionManagement() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const data = await sessionsAPI.getSessions();
      setSessions(data);
    } catch (error) {
      toast.error('Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: number) => {
    try {
      await sessionsAPI.revokeSession(id);
      toast.success('Session logged out successfully');
      setSessions(sessions.filter(s => s.id !== id));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to logout session');
    }
  };

  const parseDeviceType = (userAgent: string) => {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-6 w-6 text-indigo-500" />;
    }
    if (ua.includes('electron') || ua.includes('wnd-tracker')) {
      return <Monitor className="h-6 w-6 text-emerald-500" />;
    }
    return <Globe className="h-6 w-6 text-blue-500" />;
  };

  const getBrowserName = (userAgent: string) => {
    if (!userAgent) return 'Unknown Device';
    
    // Very basic parsing for display
    const parts = userAgent.split(' ');
    
    if (userAgent.includes('Electron')) return 'Desktop App';
    if (userAgent.includes('Edg/')) return 'Edge Browser';
    if (userAgent.includes('Chrome/')) return 'Chrome Browser';
    if (userAgent.includes('Firefox/')) return 'Firefox Browser';
    if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari Browser';
    
    return parts.length > 0 ? parts[0] : 'Unknown Browser';
  };

  const getOSName = (userAgent: string) => {
    if (!userAgent) return '';
    if (userAgent.includes('Win')) return 'Windows';
    if (userAgent.includes('Mac')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
    return '';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="bg-white shadow sm:rounded-lg overflow-hidden mt-6">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
          <ShieldAlert className="h-5 w-5 mr-2 text-indigo-600" />
          Active Login Sessions
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Manage and log out your active sessions across other browsers and devices.
        </p>
      </div>
      
      <ul className="divide-y divide-gray-200">
        {sessions.map((session) => (
          <li key={session.id} className="p-4 sm:px-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center min-w-0 flex-1">
                <div className="flex-shrink-0 mr-4 p-2 bg-gray-100 rounded-lg">
                  {parseDeviceType(session.device_name || '')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-3">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {getBrowserName(session.device_name || '')}
                      {getOSName(session.device_name || '') && <span className="text-gray-500 font-normal"> on {getOSName(session.device_name || '')}</span>}
                    </p>
                    {session.is_current && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-col sm:flex-row sm:space-x-6 text-xs text-gray-500">
                    <div className="flex items-center mb-1 sm:mb-0">
                      <MapPin className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                      {session.ip_address || 'Unknown IP'}
                    </div>
                    <div className="flex items-center mb-1 sm:mb-0">
                      <Clock className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                      Login: {formatDate(session.created_at)}
                    </div>
                    {session.last_used_at && (
                      <div className="flex items-center">
                        <Monitor className="flex-shrink-0 mr-1.5 h-3.5 w-3.5 text-gray-400" />
                        Last active: {formatDate(session.last_used_at)}
                      </div>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-gray-400 truncate" title={session.device_name}>
                    {session.device_name}
                  </div>
                </div>
              </div>
              <div className="ml-5 flex-shrink-0">
                {!session.is_current && (
                  <button
                    onClick={() => handleRevoke(session.id)}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1" />
                    Log Out
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
        {sessions.length === 0 && (
          <li className="p-4 text-center text-gray-500 text-sm">
            No active sessions found.
          </li>
        )}
      </ul>
    </div>
  );
}
