import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { usersAPI } from '../api/users';
import { timeTrackingAPI } from '../api/timeTracking';
import { projectsAPI } from '../api/projects';
import { tasksAPI } from '../api/tasks';
import { useAuthStore } from '../stores/authStore';
import type { TimeLog, User, Screenshot, Project, Task } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';

type SimplePeerInstance = import('simple-peer').Instance;
type SimplePeerSignalData = import('simple-peer').SignalData;
type SimplePeerConstructor = typeof import('simple-peer')['default'];

export default function Timesheets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState<string>(() => new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedLog, setSelectedLog] = useState<TimeLog | null>(null);
  const [selectedShot, setSelectedShot] = useState<Screenshot | null>(null);
  const [isLiveWatching, setIsLiveWatching] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    projectId: '',
    taskId: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '10:00',
    description: ''
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'assigned', employeeId],
    queryFn: () => employeeId ? usersAPI.getAssignedProjects(employeeId) : Promise.resolve([]),
    enabled: showManualModal && user?.role === 'admin' && !!employeeId
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'assigned', employeeId, manualForm.projectId],
    queryFn: () => (manualForm.projectId && employeeId) ? usersAPI.getAssignedProjectTasks(employeeId, Number(manualForm.projectId)) : Promise.resolve([]),
    enabled: showManualModal && user?.role === 'admin' && !!manualForm.projectId && !!employeeId
  });

  const addManualTimeMutation = useMutation({
    mutationFn: (data: typeof manualForm) => {
      if (!employeeId) throw new Error("No employee selected");
      
      // Send as local time string "YYYY-MM-DD HH:mm:ss" to avoid UTC conversion issues
      const startStr = `${data.date} ${data.startTime}:00`;
      const endStr = `${data.date} ${data.endTime}:00`;
      
      return timeTrackingAPI.addManualTimeLog(employeeId, {
        project_id: data.projectId ? Number(data.projectId) : null,
        task_id: data.taskId ? Number(data.taskId) : null,
        start_time: startStr,
        end_time: endStr,
        description: data.description
      });
    },
    onSuccess: () => {
      toast.success('Manual time added');
      setShowManualModal(false);
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'logs'] });
      // Reset form
      setManualForm({
        projectId: '',
        taskId: '',
        date: new Date().toISOString().slice(0, 10),
        startTime: '09:00',
        endTime: '10:00',
        description: ''
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.message || 'Failed to add time');
    }
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerRef = useRef<SimplePeerInstance | null>(null);

  // Auto-select current employee if not admin
  useEffect(() => {
    if (user && user.role === 'employee') {
      setEmployeeId(user.id);
      
      // Check if tracker is running and redirect to dashboard
      const stored = localStorage.getItem('tt-tracker');
      if (stored) {
        try {
          const { isTracking } = JSON.parse(stored);
          if (isTracking) {
            navigate('/');
            toast.warning('Please stop the tracker to view timesheets.');
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }, [user, navigate]);

  const deleteScreenshotMutation = useMutation({
    mutationFn: (screenshotId: number) => {
      if (!employeeId) throw new Error("No employee selected");
      return timeTrackingAPI.deleteScreenshot(employeeId, screenshotId);
    },
    onSuccess: () => {
      toast.success('Screenshot deleted and time deducted');
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'shots', selectedLog?.id] });
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'logs', employeeId, startDate, endDate] });
      setSelectedShot(null);
    },
    onError: () => {
      toast.error('Failed to delete screenshot');
    }
  });

  // We need to dynamically import SimplePeer because it requires Node polyfills
  // which might cause issues if imported at the top level in some environments
  const [SimplePeer, setSimplePeer] = useState<SimplePeerConstructor | null>(null);

  useEffect(() => {
    import('simple-peer').then((module) => {
       setSimplePeer(() => module.default);
    });
  }, []);

  useEffect(() => {
    shouldBeLiveRef.current = isLiveWatching;
    let interval: number;
    let keepAliveInterval: number;
    let signalInterval: number;
    
    if (isLiveWatching && selectedLog && !selectedLog.end_time && employeeId && SimplePeer) {
       // Refresh screenshots (keep existing logic as fallback or history)
       interval = window.setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ['timesheets', 'shots', employeeId] });
       }, 10000); // Slower refresh for history
       
       // Keep live session alive
       keepAliveInterval = window.setInterval(() => {
          usersAPI.triggerLive(employeeId).catch(() => {
             toast.error('Live session disconnected');
             setIsLiveWatching(false);
          });
       }, 45000); 

      // Polling for signaling (Answer & Candidates)
      signalInterval = window.setInterval(async () => {
           if (!peerRef.current) return;
           
           try {
               const offerData = await usersAPI.getSignal(employeeId, 'offer');
               if (offerData) {
                   const sanitizeSdp = (sdp: string) => {
                       const lines = sdp.split(/\r\n|\n/);
                       const filtered = lines.filter((l) => !l.startsWith('a=max-message-size:'));
                       const rebuilt = filtered.join('\r\n').trim();
                       return rebuilt ? `${rebuilt}\r\n` : rebuilt;
                   };

                   const normalizeOffer = (input: unknown): SimplePeerSignalData | null => {
                       if (!input) return null;
                       if (typeof input === 'string') {
                           const trimmed = input.trim();
                           if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                               try {
                                   return JSON.parse(trimmed) as SimplePeerSignalData;
                               } catch {
                                   return { type: 'offer', sdp: trimmed } as SimplePeerSignalData;
                               }
                           }
                           return { type: 'offer', sdp: trimmed } as SimplePeerSignalData;
                       }
                       if (typeof input === 'object') {
                           const obj = input as Record<string, unknown>;
                           if (typeof obj.type === 'string' && (typeof obj.sdp === 'string' || typeof obj.candidate === 'string' || typeof obj.candidate === 'object')) {
                               return obj as unknown as SimplePeerSignalData;
                           }
                           if (typeof obj.sdp === 'string') {
                               return { type: 'offer', sdp: obj.sdp } as SimplePeerSignalData;
                           }
                       }
                       return null;
                   };

                   const normalized = normalizeOffer(offerData);
                   const cleanedSdp =
                       normalized && typeof (normalized as unknown as { sdp?: unknown }).sdp === 'string'
                           ? sanitizeSdp((normalized as unknown as { sdp: string }).sdp)
                           : null;
                   const dedupeKey = cleanedSdp ?? JSON.stringify(normalized);

                   if (normalized && dedupeKey && dedupeKey !== lastSignalRef.current) {
                        lastSignalRef.current = dedupeKey;
                        if (isPeerConnectedRef.current) {
                             startLiveSession();
                        } else {
                             const toSignal =
                                 cleanedSdp && typeof (normalized as unknown as { sdp?: unknown }).sdp === 'string'
                                     ? ({ ...(normalized as unknown as Record<string, unknown>), sdp: cleanedSdp } as unknown as SimplePeerSignalData)
                                     : normalized;
                             peerRef.current.signal(toSignal);
                        }
                   }
               }

               // Check for candidates
               const candidates = await usersAPI.getSignal(employeeId, 'candidate');
               if (candidates && Array.isArray(candidates)) {
                   const normalizeCandidate = (input: unknown): SimplePeerSignalData | null => {
                       if (!input) return null;
                       if (typeof input === 'string') {
                           try {
                               const parsed = JSON.parse(input) as unknown;
                               return normalizeCandidate(parsed);
                           } catch {
                               return null;
                           }
                       }
                       if (typeof input === 'object') {
                           const obj = input as Record<string, unknown>;
                           if (typeof obj.type === 'string') return obj as unknown as SimplePeerSignalData;
                           if (typeof obj.candidate === 'string') return { type: 'candidate', candidate: obj.candidate } as unknown as SimplePeerSignalData;
                           return { type: 'candidate', candidate: obj as unknown as RTCIceCandidateInit } as unknown as SimplePeerSignalData;
                       }
                       return null;
                   };

                   for (const cand of candidates as Array<{ candidate?: unknown }>) {
                       const raw = cand?.candidate;
                       if (!raw) continue;
                       const normalized = normalizeCandidate(raw);
                       if (!normalized) continue;
                       peerRef.current.signal(normalized);
                   }
               }

           } catch (e) { void e; }
       }, 2000); // Poll faster for responsiveness
    }
    return () => {
       window.clearInterval(interval);
       window.clearInterval(keepAliveInterval);
       window.clearInterval(signalInterval);
       
       if (peerRef.current) {
           peerRef.current.destroy();
           peerRef.current = null;
       }
    };
  }, [isLiveWatching, selectedLog, employeeId, queryClient, SimplePeer]);

  const lastSignalRef = useRef<string | null>(null);
  const isPeerConnectedRef = useRef(false);
  const shouldBeLiveRef = useRef(false);

  const startLiveSession = async () => {
    if (!employeeId || !SimplePeer) return;
    shouldBeLiveRef.current = true;
    
    try {
        if (peerRef.current) {
            try { peerRef.current.destroy(); } catch (e) { void e; }
            peerRef.current = null;
        }
        isPeerConnectedRef.current = false;

        // Ensure we trigger live mode on backend
        await usersAPI.triggerLive(employeeId);
        
        const getIceServers = () => {
            const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
            const turnUrl = env?.VITE_TURN_URL;
            const turnUser = env?.VITE_TURN_USERNAME;
            const turnPass = env?.VITE_TURN_PASSWORD;
            const turnUrlsRaw = env?.VITE_TURN_URLS;
            const servers: RTCIceServer[] = [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' },
              { urls: 'stun:stun4.l.google.com:19302' },
              { urls: 'stun:stun.cloudflare.com:3478' },
              { urls: 'stun:global.stun.twilio.com:3478' },
            ];
            if (turnUrl && turnUser && turnPass) {
                const urls = turnUrl.includes(',') ? turnUrl.split(',').map(u => u.trim()) : turnUrl;
                servers.push({ urls, username: turnUser, credential: turnPass });
            }
            if (turnUrlsRaw && turnUser && turnPass) {
              const urls = turnUrlsRaw.split(',').map(u => u.trim()).filter(Boolean);
              for (const u of urls) {
                servers.push({ urls: u, username: turnUser, credential: turnPass });
              }
            }
            return servers;
        };

        const p = new SimplePeer({
            initiator: false,
            trickle: true,
            config: { iceServers: getIceServers() }
        });
        peerRef.current = p;

        p.on('signal', async (data: SimplePeerSignalData) => {
            const sanitizeSdp = (sdp: string) => {
                const lines = sdp.split(/\r\n|\n/);
                const filtered = lines.filter((l) => !l.startsWith('a=max-message-size:'));
                const rebuilt = filtered.join('\r\n').trim();
                return rebuilt ? `${rebuilt}\r\n` : rebuilt;
            };

            // console.info('[LiveView][Admin] Signal generated', data.type);
            if ((data as { type?: string }).type === 'answer') {
                const sdp = (data as unknown as { sdp?: unknown }).sdp;
                const payload = { ...(data as unknown as Record<string, unknown>) };
                if (typeof sdp === 'string') payload.sdp = sanitizeSdp(sdp);
                await usersAPI.signal(employeeId, { type: 'answer', sdp: payload });
            } else if ((data as { type?: string }).type === 'candidate') {
                 await usersAPI.signal(employeeId, { type: 'candidate', candidate: data as unknown as Record<string, unknown> });
            } else {
                 await usersAPI.signal(employeeId, { type: 'answer', sdp: data as unknown as Record<string, unknown> });
            }
        });

        p.on('connect', () => {
            isPeerConnectedRef.current = true;
            toast.success('Stream Connected');
        });

        p.on('stream', (stream: MediaStream) => {
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(() => {});
            }
        });
        
        p.on('error', (err: unknown) => {
            void err;
        });

        p.on('close', () => {
            isPeerConnectedRef.current = false;
            if (shouldBeLiveRef.current) {
                setTimeout(() => startLiveSession(), 1000);
            }
        });

    } catch (error) {
        void error;
        toast.error('Failed to start Live View');
    }
  };

  const stopLiveSession = async () => {
      shouldBeLiveRef.current = false;
      if (employeeId) {
          try { await usersAPI.stopLive(employeeId); } catch (e) { void e; }
      }
      if (peerRef.current) {
          try { peerRef.current.destroy(); } catch (e) { void e; }
          peerRef.current = null;
      }
      isPeerConnectedRef.current = false;
      setIsLiveWatching(false);
      if (videoRef.current) videoRef.current.srcObject = null;
  };

  const handleLiveToggle = async () => {
    if (!employeeId) return;
    if (!SimplePeer) {
        toast.error('WebRTC library not loaded yet, please wait...');
        return;
    }

    if (!isLiveWatching) {
        setIsLiveWatching(true);
        toast.success('Live View requested...');
        await startLiveSession();
    } else {
        await stopLiveSession();
        toast.info('Live View Stopped');
    }
  };

  const { data: employees, isLoading: loadingEmployees } = useQuery<{ data: User[] }>({
    queryKey: ['employees', 'timesheets', search],
    queryFn: () => usersAPI.getUsers({ role: 'employee', search, page: 1 }),
    enabled: !!user && user.role === 'admin',
  });

  const { data: timeLogs, isLoading: loadingLogs } = useQuery<TimeLog[]>({
    queryKey: ['timesheets', 'logs', employeeId, startDate, endDate],
    queryFn: () => employeeId ? timeTrackingAPI.getUserTimeLogsAdmin(employeeId, { start_date: startDate, end_date: endDate }) : Promise.resolve([]),
    enabled: !!employeeId,
  });

  // Fetch screenshots ONLY for the selected log to reduce server load
  const { data: logScreenshotsData, isLoading: loadingShots } = useQuery<Screenshot[]>({
    queryKey: ['timesheets', 'shots', selectedLog?.id],
    queryFn: () => (employeeId && selectedLog) 
      ? timeTrackingAPI.getUserScreenshotsAdmin(employeeId, { time_log_id: selectedLog.id }) 
      : Promise.resolve([]),
    enabled: !!employeeId && !!selectedLog,
  });

  const activityRange = useMemo(() => {
    if (!selectedLog) return null;
    const start = selectedLog.start_time;
    // If active (no end_time), show up to NOW (plus buffer)
    const end = selectedLog.end_time 
      ? selectedLog.end_time 
      : new Date().toISOString();
      
    return { start, end };
  }, [selectedLog]);

  const fixDate = (dateStr: string) => {
    // Standard parse - the browser will convert UTC (Z) to local time automatically
    return new Date(dateStr);
  };

  const logScreenshots = useMemo(() => {
    if (!selectedLog || !logScreenshotsData) return [];
    
    // We trust the backend to return the correct screenshots for this log ID.
    // We just sort them here.
    return [...logScreenshotsData].sort((a, b) => {
      const tA = new Date(a.captured_at).getTime();
      const tB = new Date(b.captured_at).getTime();
      return sortOrder === 'asc' ? tA - tB : tB - tA;
    });
  }, [selectedLog, logScreenshotsData, sortOrder]);

  const secureUrl = (u?: string) => {
    if (!u) return '';
    const proto = window.location.protocol;
    const s = u.trim().replace(/^["'`]+|["'`]+$/g, '');
    if (s.startsWith('http://') || s.startsWith('https://')) {
      return proto + '//' + s.replace(/^https?:\/\//, '');
    }
    if (s.startsWith('//')) return proto + s;
    if (s.startsWith('/')) return window.location.origin + s;
    if (s.startsWith('screenshots/')) return window.location.origin + '/storage/' + s;
    return s;
  };
  const buildSrc = (shot: Screenshot, preferUrl: boolean) => {
    const primary = preferUrl ? (shot.url || '') : (shot.file_path || '');
    if (primary) return secureUrl(primary);
    if (shot.file_path) return secureUrl(shot.file_path);
    return '';
  };




  const groupedByDate = useMemo(() => {
    const map: Record<string, { total: number; logs: TimeLog[] }> = {};
    
    (timeLogs ?? []).forEach((log) => {
      const key = log.start_time.slice(0, 10);
      if (!map[key]) map[key] = { total: 0, logs: [] };
      map[key].logs.push(log);
      map[key].total += log.duration ?? 0;
    });

    // Sort logs within each date group by start_time (Descending) as per user preference
    Object.values(map).forEach(group => {
      group.logs.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    });

    return Object.entries(map).sort((a, b) => a[0] < b[0] ? 1 : -1);
  }, [timeLogs]);

  if (!user || (user.role !== 'admin' && user.role !== 'employee')) {
    return <div className="py-8 text-center text-gray-500">Access denied.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between relative">
        <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
        {user.role === 'admin' && (
          <button
            onClick={() => {
              if (!employeeId) {
                toast.error('Please select an employee first');
                return;
              }
              setShowManualModal(true);
            }}
            className="absolute right-0 top-0 px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 whitespace-nowrap"
            style={{ transform: 'translateY(4px)' }} 
          >
            Add Time
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Employee</label>
            <div className="flex gap-2">
              {user.role === 'admin' && (
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees"
                className="mt-1 block w-1/2 border rounded px-3 py-2"
              />
              )}
              <select
                value={employeeId ?? ''}
                onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : undefined)}
                className="mt-1 block w-full border rounded px-3 py-2"
                disabled={user.role === 'employee'}
              >
                {user.role === 'admin' ? (
                  <>
                  <option value="">Select employee</option>
                  {(employees?.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                  </>
                ) : (
                  <option value={user.id}>{user.name} ({user.email})</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
          </div>
        </div>

        {(loadingEmployees || loadingLogs) && <LoadingSpinner className="h-24" />}

        {employeeId && (timeLogs?.length ?? 0) === 0 && !loadingLogs && (
          <p className="text-sm text-gray-500">No time logs for selected period.</p>
        )}

        {groupedByDate.length > 0 && (
          <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-300px)] pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {groupedByDate.map(([date, info]) => (
              <div key={date} className="border rounded-lg">
                <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                  <div className="font-medium">{date}</div>
                  <div className="text-sm text-gray-600">Total: {Math.floor((info.total ?? 0) / 60)}h {(info.total ?? 0) % 60}m</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Project</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration (min)</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {info.logs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-4 py-2 text-sm text-gray-900">{log.project?.name ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {log.task?.title ?? '-'}
                            {log.is_manual && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Manual Time Set
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{fixDate(log.start_time).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{log.end_time ? fixDate(log.end_time).toLocaleString() : '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{log.duration ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{log.description ?? '-'}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                            >Activity</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* <div className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Screenshots</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {(screenshots ?? []).filter((s) => s.captured_at.slice(0,10) === date).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedShot(s)}
                        className="block focus:outline-none"
                        aria-label={`Open screenshot ${s.file_name}`}
                      >
                        <img src={s.url ?? s.file_path} alt={s.file_name} className="w-full h-24 object-cover rounded border" />
                      </button>
                    ))}
                  </div>
                </div> */}
              </div>
            ))}
          </div>
        )}
      </div>
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-white rounded-t-lg">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Activity Details</h3>
                  <div className="text-sm text-gray-500 mt-1">
                    {fixDate(selectedLog.start_time).toLocaleString()} – {selectedLog.end_time ? fixDate(selectedLog.end_time).toLocaleString() : 'In Progress'}
                  </div>
                </div>
                <div className="flex items-center">
                  <div className="mr-4 flex items-center border rounded overflow-hidden">
                    <button
                      onClick={() => setSortOrder('asc')}
                      className={`px-3 py-1 text-sm ${sortOrder === 'asc' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Oldest First
                    </button>
                    <div className="w-px h-full bg-gray-200"></div>
                    <button
                      onClick={() => setSortOrder('desc')}
                      className={`px-3 py-1 text-sm ${sortOrder === 'desc' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Newest First
                    </button>
                  </div>

                  {!selectedLog.end_time && user?.role === 'admin' && (
                    <button 
                      onClick={handleLiveToggle}
                      className={`mr-4 px-3 py-1 rounded text-sm font-medium transition-colors ${isLiveWatching ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                    >
                      {isLiveWatching ? 'Stop Live View' : 'Watch Live'}
                    </button>
                  )}
                  <button 
                    onClick={async () => { 
                      if (isLiveWatching && employeeId) {
                        try { await usersAPI.stopLive(employeeId); } catch { void 0; }
                      }
                      setSelectedLog(null); 
                      setIsLiveWatching(false); 
                    }} 
                    className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    aria-label="Close"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {isLiveWatching && (
                  <div className="mb-6 bg-black rounded-lg overflow-hidden shadow-lg aspect-video flex items-center justify-center relative group">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted
                        controls 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-4 right-4 bg-red-600 text-white px-2 py-1 rounded text-xs animate-pulse">
                          LIVE
                      </div>
                  </div>
              )}

              {loadingShots ? (
                <div className="flex items-center justify-center py-12">
                  <LoadingSpinner className="h-12 w-12 text-indigo-600" />
                </div>
              ) : logScreenshots.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {logScreenshots.map(shot => {
                    const stats = shot.minute_breakdown?.reduce((acc, curr) => ({
                      keyboard: acc.keyboard + (curr.keyboard_clicks || 0),
                      mouse: acc.mouse + (curr.mouse_clicks || 0),
                      scroll: acc.scroll + (curr.mouse_scrolls || 0),
                      movement: acc.movement + (curr.mouse_movements || 0),
                      total: acc.total + (curr.total_activity || 0)
                    }), { keyboard: 0, mouse: 0, scroll: 0, movement: 0, total: 0 });

                    return (
                      <div key={shot.id} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                         <div 
                           className="cursor-pointer relative group"
                           onClick={() => setSelectedShot(shot)}
                         >
                           <img 
                            src={buildSrc(shot, true)} 
                            onError={(e) => { 
                              const img = e.currentTarget as HTMLImageElement;
                              if (img.dataset.errored === 'true') return;
                              img.dataset.errored = 'true';
                              img.onerror = null;
                              img.src = '/placeholder-image.png';
                            }}
                            alt={shot.file_name} 
                            className="w-full h-48 object-cover group-hover:opacity-95 transition-opacity" 
                          />
                           <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                             <div className="opacity-0 group-hover:opacity-100 bg-black/50 text-white text-xs px-2 py-1 rounded">
                               View Full
                             </div>
                           </div>
                         </div>
                         
                         <div className="p-3 bg-white">
                           <div className="flex justify-between items-center mb-3">
                              <span className="font-medium text-sm text-gray-900">{new Date(shot.captured_at).toLocaleTimeString()}</span>
                              {user?.role === 'admin' && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                    Total: {stats?.total || 0}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm('Are you sure you want to delete this screenshot? It will reduce the tracked time.')) {
                                        deleteScreenshotMutation.mutate(shot.id);
                                      }
                                    }}
                                    className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-red-50"
                                    title="Delete Screenshot"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                              {user?.role === 'employee' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm('Are you sure you want to delete this screenshot? It will reduce your tracked time.')) {
                                      deleteScreenshotMutation.mutate(shot.id);
                                    }
                                  }}
                                  className="text-xs text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-2 py-1 rounded"
                                >
                                  Delete
                                </button>
                              )}
                           </div>

                           {user?.role === 'admin' && stats ? (
                             <>
                             <div className="grid grid-cols-4 gap-2 text-center mb-3">
                               <div className="bg-blue-50 p-1.5 rounded">
                                 <div className="font-bold text-blue-700 text-sm">{stats.mouse}</div>
                                 <div className="text-[10px] text-blue-600 uppercase font-semibold">Clicks</div>
                               </div>
                               <div className="bg-purple-50 p-1.5 rounded">
                                 <div className="font-bold text-purple-700 text-sm">{stats.keyboard}</div>
                                 <div className="text-[10px] text-purple-600 uppercase font-semibold">Keys</div>
                               </div>
                               <div className="bg-green-50 p-1.5 rounded">
                                 <div className="font-bold text-green-700 text-sm">{stats.scroll}</div>
                                 <div className="text-[10px] text-green-600 uppercase font-semibold">Scrolls</div>
                               </div>
                               <div className="bg-orange-50 p-1.5 rounded">
                                 <div className="font-bold text-orange-700 text-sm">{stats.movement}</div>
                                 <div className="text-[10px] text-orange-600 uppercase font-semibold">Moves</div>
                               </div>
                             </div>
                             
                             {shot.minute_breakdown && shot.minute_breakdown.length > 0 && (
                               <div className="space-y-1 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto border border-gray-100 text-xs">
                                 {shot.minute_breakdown.map((m, i) => (
                                   <div key={i} className="flex justify-between items-center py-1 border-b border-gray-200 last:border-0">
                                     <span className="text-gray-600 font-mono">{m.time}</span>
                                     <div className="flex gap-2 font-medium text-gray-800">
                                       <span title="Mouse Clicks" className="flex items-center gap-0.5">
                                         <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>{m.mouse_clicks}
                                       </span>
                                       <span title="Keyboard Clicks" className="flex items-center gap-0.5">
                                         <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>{m.keyboard_clicks}
                                       </span>
                                       <span title="Mouse Scrolls" className="flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>{m.mouse_scrolls || 0}
                                       </span>
                                       <span title="Mouse Movements" className="flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>{m.mouse_movements || 0}
                                       </span>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             )}
                             </>
                           ) : user?.role === 'admin' ? (
                             <div className="text-center italic text-gray-400 py-2 text-xs">No activity data</div>
                           ) : null}
                         </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-lg font-medium">No screenshots recorded</p>
                  <p className="text-sm">No activity data available for this time log.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t bg-gray-50 rounded-b-lg flex justify-end sticky bottom-0 z-10">
              <button 
                onClick={() => setSelectedLog(null)} 
                className="px-4 py-2 rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium shadow-sm transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedShot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setSelectedShot(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <div className="font-semibold">Screenshot</div>
                <div className="text-xs text-gray-500">{new Date(selectedShot.captured_at).toLocaleString()}</div>
              </div>
              <button onClick={() => setSelectedShot(null)} className="px-2 py-1 text-sm rounded bg-gray-100 text-gray-700">Close</button>
            </div>
            <div className="p-4">
              <img 
                src={buildSrc(selectedShot, true)} 
                onError={(e) => { 
                  const img = e.currentTarget as HTMLImageElement;
                  if (img.dataset.errored === 'true') return;
                  img.dataset.errored = 'true';
                  img.onerror = null;
                  img.src = '/placeholder-image.png';
                }} 
                alt={selectedShot.file_name} 
                className="max-w-[85vw] max-h-[75vh] object-contain rounded" 
              />
            </div>
          </div>
        </div>
      )}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Add Manual Time</h3>
              <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Project (Optional)</label>
                <select
                  value={manualForm.projectId}
                  onChange={(e) => setManualForm({ ...manualForm, projectId: e.target.value, taskId: '' })}
                  className="mt-1 block w-full border rounded px-3 py-2"
                >
                  <option value="">No Project</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Task (Optional)</label>
                <select
                  value={manualForm.taskId}
                  onChange={(e) => setManualForm({ ...manualForm, taskId: e.target.value })}
                  className="mt-1 block w-full border rounded px-3 py-2"
                  disabled={!manualForm.projectId}
                >
                  <option value="">Select Task</option>
                  {tasks?.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="mt-1 block w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Time</label>
                  <input
                    type="time"
                    value={manualForm.startTime}
                    onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                    className="mt-1 block w-full border rounded px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Time</label>
                  <input
                    type="time"
                    value={manualForm.endTime}
                    onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                    className="mt-1 block w-full border rounded px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  className="mt-1 block w-full border rounded px-3 py-2"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addManualTimeMutation.mutate(manualForm)}
                  disabled={addManualTimeMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {addManualTimeMutation.isPending ? 'Saving...' : 'Save Time Log'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
