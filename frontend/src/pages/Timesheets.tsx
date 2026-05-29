import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { usersAPI } from '../api/users';
import { timeTrackingAPI } from '../api/timeTracking';
import { authAPI } from '../api/auth';
import { useAuthStore } from '../stores/authStore';
import type { TimeLog, User, Screenshot } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { toast } from 'sonner';

type SimplePeerInstance = import('simple-peer').Instance;
type SimplePeerSignalData = import('simple-peer').SignalData;
type SimplePeerConstructor = typeof import('simple-peer')['default'];

const truncateWords = (text?: string, count = 3) => {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= count) return text;
  return words.slice(0, count).join(' ') + '...';
};

export default function Timesheets() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const hasInitializedRef = useRef(false);

  // 2FA States
  const [is2FaVerified, setIs2FaVerified] = useState<boolean>(() => {
    return sessionStorage.getItem('tt-2fa-verified') === 'true';
  });
  const [isChecking2Fa, setIsChecking2Fa] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpCode, setOtpCode] = useState<string[]>(Array(6).fill(''));
  const [backupCodeInput, setBackupCodeInput] = useState('');
  const [availableMethods, setAvailableMethods] = useState<('email' | 'totp' | 'backup')[]>(['email']);
  const [selectedMethod, setSelectedMethod] = useState<'email' | 'totp' | 'backup'>('email');
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Cooldown effect
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const sendOtp = async () => {
    setIsSendingOtp(true);
    setErrorMsg('');
    try {
      const res = await authAPI.send2FaOtp();
      setMaskedEmail(res.email || 'your registered email');
      setCooldown(60);
      toast.success(res.message || 'Verification code sent successfully');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to send verification code. Please try again.');
      toast.error('Failed to send verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Listen for global 2FA challenge triggers from Axios interceptor (e.g. backend cache expires)
  useEffect(() => {
    const handle2FaRequired = () => {
      setIs2FaVerified(false);
      hasInitializedRef.current = false;
    };
    window.addEventListener('tt-2fa-required', handle2FaRequired);
    return () => {
      window.removeEventListener('tt-2fa-required', handle2FaRequired);
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'admin' || hasInitializedRef.current) return;

    const init2Fa = async () => {
      hasInitializedRef.current = true;
      setIsChecking2Fa(true);
      try {
        const res = await authAPI.get2FaStatusFull();
        if (res.verified) {
          setIs2FaVerified(true);
          sessionStorage.setItem('tt-2fa-verified', 'true');
        } else {
          setIs2FaVerified(false);
          sessionStorage.removeItem('tt-2fa-verified');
          const methods = res.methods || ['email'];
          setAvailableMethods(methods);
          const defaultM = res.default_method || methods[0] || 'email';
          setSelectedMethod(defaultM);

          if (defaultM === 'email') {
            await sendOtp();
          }
        }
      } catch {
        setIs2FaVerified(false);
        sessionStorage.removeItem('tt-2fa-verified');
        await sendOtp();
      } finally {
        setIsChecking2Fa(false);
      }
    };
    init2Fa();
  }, [user]);

  const handleMethodChange = async (method: 'email' | 'totp' | 'backup') => {
    setSelectedMethod(method);
    setErrorMsg('');
    setOtpCode(Array(6).fill(''));
    setBackupCodeInput('');
    if (method === 'email' && cooldown === 0) {
      await sendOtp();
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    let code = '';
    if (selectedMethod === 'backup') {
      code = backupCodeInput.trim();
      if (code.length !== 8) {
        setErrorMsg('Please enter a valid 8-character recovery code.');
        return;
      }
    } else {
      code = otpCode.join('').trim();
      if (code.length !== 6) {
        setErrorMsg('Please enter the full 6-digit code.');
        return;
      }
    }

    setIsVerifyingOtp(true);
    setErrorMsg('');
    try {
      const res = await authAPI.verify2FaOtp(code, selectedMethod);
      if (res.verified) {
        setIs2FaVerified(true);
        sessionStorage.setItem('tt-2fa-verified', 'true');
        toast.success(res.message || 'Two-factor authentication verified successfully.');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Verification failed. Please check and try again.');
      toast.error('Verification failed');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    if (value && !/^\d+$/.test(value)) return;

    const newCode = [...otpCode];
    newCode[index] = value.slice(-1);
    setOtpCode(newCode);
    setErrorMsg('');

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) (nextInput as HTMLInputElement).focus();
    }
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      if (prevInput) {
        (prevInput as HTMLInputElement).focus();
        const newCode = [...otpCode];
        newCode[index - 1] = '';
        setOtpCode(newCode);
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(text)) {
      const chars = text.split('');
      setOtpCode(chars);
      setErrorMsg('');
      const lastInput = document.getElementById('otp-input-5');
      if (lastInput) (lastInput as HTMLInputElement).focus();
    }
  };

  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState<string>(() => new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedLog, setSelectedLog] = useState<TimeLog | null>(null);
  const [viewingNotesLog, setViewingNotesLog] = useState<TimeLog | null>(null);
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

  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLogToEdit, setSelectedLogToEdit] = useState<TimeLog | null>(null);
  const [editForm, setEditForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    description: '',
    startWorkLog: '',
    endWorkLog: ''
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
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e.response?.data?.message ?? e.message ?? 'Failed to add time');
    }
  });

  const editTimeMutation = useMutation({
    mutationFn: (data: typeof editForm) => {
      if (!employeeId || !selectedLogToEdit) throw new Error("No employee or log selected");
      
      const startStr = `${data.date} ${data.startTime}:00`;
      const endStr = data.endTime ? `${data.date} ${data.endTime}:00` : null;
      
      return timeTrackingAPI.updateTimeLogAdmin(employeeId, selectedLogToEdit.id, {
        start_time: startStr,
        end_time: endStr,
        description: data.description,
        start_work_log: data.startWorkLog,
        end_work_log: data.endWorkLog
      });
    },
    onSuccess: () => {
      toast.success('Time log updated');
      setShowEditModal(false);
      setSelectedLogToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['timesheets', 'logs'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(e.response?.data?.message ?? e.message ?? 'Failed to update time');
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
        } catch {
          void 0;
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
       }, 2000); // Fast refresh for near real-time updates (2s)
       
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
       shouldBeLiveRef.current = false;
       window.clearInterval(interval);
       window.clearInterval(keepAliveInterval);
       window.clearInterval(signalInterval);
       
       if (peerRef.current) {
           try { peerRef.current.destroy(); } catch (e) { void e; }
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
          usersAPI.stopLive(employeeId).catch(() => {});
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

  const selectedShotIndex = useMemo(() => {
    if (!selectedShot) return -1;
    return logScreenshots.findIndex((s) => s.id === selectedShot.id);
  }, [logScreenshots, selectedShot]);

  const prevShot = selectedShotIndex > 0 ? logScreenshots[selectedShotIndex - 1] : null;
  const nextShot =
    selectedShotIndex >= 0 && selectedShotIndex < logScreenshots.length - 1
      ? logScreenshots[selectedShotIndex + 1]
      : null;

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

  if (user.role === 'admin' && !is2FaVerified) {
    if (isChecking2Fa) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-gray-500 animate-pulse font-medium">Checking security verification status...</p>
        </div>
      );
    }

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
        <div className="bg-white/80 backdrop-blur-md shadow-2xl rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center space-y-6 transform transition-all duration-300 hover:scale-[1.01]">
          {/* Animated Lock Shield */}
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center bg-indigo-50 text-indigo-600 rounded-full border border-indigo-100 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" className="w-10 h-10 animate-pulse">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-indigo-400/20 blur animate-ping opacity-75 pointer-events-none"></div>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">Security Verification</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              {selectedMethod === 'backup' 
                ? 'Use one of your 8-character recovery backup codes to unlock timesheets.'
                : selectedMethod === 'totp'
                ? 'Open your Authenticator App (Google/Microsoft) and enter the 6-digit passcode.'
                : 'To view timesheet records and employee logs, please complete Two-Factor Authentication.'
              }
            </p>
          </div>

          {/* Method Switcher Header */}
          {availableMethods.length > 1 && (
            <div className="flex justify-center border-b border-gray-100 pb-2">
              <div className="flex bg-gray-100 p-1 rounded-xl w-full">
                {availableMethods.includes('totp') && (
                  <button
                    type="button"
                    onClick={() => handleMethodChange('totp')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all outline-none ${
                      selectedMethod === 'totp' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    📲 App
                  </button>
                )}
                {availableMethods.includes('email') && (
                  <button
                    type="button"
                    onClick={() => handleMethodChange('email')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all outline-none ${
                      selectedMethod === 'email' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    ✉️ Email
                  </button>
                )}
                {availableMethods.includes('backup') && (
                  <button
                    type="button"
                    onClick={() => handleMethodChange('backup')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all outline-none ${
                      selectedMethod === 'backup' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    🛡️ Backup
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedMethod === 'email' && maskedEmail && (
            <div className="bg-indigo-50/50 rounded-xl px-4 py-3 border border-indigo-50/80 inline-block w-full">
              <p className="text-xs font-medium text-indigo-700">We've sent a 6-digit verification code to</p>
              <span className="font-bold text-sm block mt-1 tracking-wide text-indigo-900">{maskedEmail}</span>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 text-red-600 rounded-xl p-3 border border-red-100 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-6">
            {selectedMethod === 'backup' ? (
              <div className="max-w-xs mx-auto space-y-2">
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Enter Backup Code (e.g. A1B2C3D4)"
                  value={backupCodeInput}
                  onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                  className="block w-full border border-gray-300 rounded-xl py-3 px-3 text-center text-lg font-bold font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
                  autoComplete="off"
                  disabled={isVerifyingOtp}
                />
              </div>
            ) : (
              /* 6-Digit PIN input boxes */
              <div className="flex justify-between max-w-xs mx-auto gap-2">
                {otpCode.map((char, index) => (
                  <input
                    key={index}
                    id={`otp-input-${index}`}
                    type="text"
                    maxLength={1}
                    value={char}
                    onChange={(e) => handleOtpChange(e.target.value, index)}
                    onKeyDown={(e) => handleOtpKeyDown(e, index)}
                    onPaste={handleOtpPaste}
                    className="w-12 h-14 text-center text-xl font-extrabold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl shadow-sm focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none"
                    autoComplete="off"
                    disabled={isVerifyingOtp}
                  />
                ))}
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isVerifyingOtp || (selectedMethod === 'backup' ? backupCodeInput.length !== 8 : otpCode.some(c => !c))}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-indigo-700/30 transition-all flex items-center justify-center space-x-2"
              >
                {isVerifyingOtp ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Verify and Access Timesheets</span>
                )}
              </button>

              {selectedMethod === 'email' && (
                <div className="pt-2 text-xs">
                  {cooldown > 0 ? (
                    <span className="text-gray-400 font-medium">
                      Resend code in <strong className="text-indigo-600 font-semibold">{cooldown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={sendOtp}
                      disabled={isSendingOtp}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-4 disabled:opacity-50 transition-colors outline-none"
                    >
                      {isSendingOtp ? 'Resending Code...' : 'Resend Verification Code'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    );
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
          <div className="space-y-6 overflow-y-auto max-h-[calc(100vh-220px)] pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
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
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Note / Work Log</th>
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
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {(log.description || log.start_work_log || log.end_work_log) ? (
                              <button
                                onClick={() => setViewingNotesLog(log)}
                                className="text-left w-full focus:outline-none group block space-y-1"
                                title="Click to view full notes & work logs"
                              >
                                {log.description && (
                                  <div className="text-gray-900 font-semibold group-hover:text-indigo-600 transition-colors">
                                    {truncateWords(log.description, 6)}
                                  </div>
                                )}
                                {log.start_work_log && (
                                  <div className="text-xs text-emerald-600 font-medium group-hover:text-emerald-700 transition-colors">
                                    <span className="font-semibold">Start:</span> {truncateWords(log.start_work_log, 6)}
                                  </div>
                                )}
                                {log.end_work_log && (
                                  <div className="text-xs text-rose-600 font-medium group-hover:text-rose-700 transition-colors">
                                    <span className="font-semibold">End:</span> {truncateWords(log.end_work_log, 6)}
                                  </div>
                                )}
                              </button>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {user?.role === 'admin' && (
                                <button
                                  onClick={() => {
                                    setSelectedLogToEdit(log);
                                    const startDt = new Date(log.start_time);
                                    let endDt = log.end_time ? new Date(log.end_time) : null;
                                    setEditForm({
                                      date: log.start_time.slice(0, 10),
                                      startTime: startDt.toTimeString().slice(0, 5),
                                      endTime: endDt ? endDt.toTimeString().slice(0, 5) : '',
                                      description: log.description || '',
                                      startWorkLog: log.start_work_log || '',
                                      endWorkLog: log.end_work_log || ''
                                    });
                                    setShowEditModal(true);
                                  }}
                                  className="px-2 py-1 text-xs rounded bg-blue-50 text-blue-700 border border-blue-200"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedLog(log)}
                                className="px-2 py-1 text-xs rounded bg-indigo-50 text-indigo-700 border border-indigo-200"
                              >Activity</button>
                            </div>
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
                      await stopLiveSession();
                      setSelectedLog(null); 
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

              {/* Note & Work Logs Section */}
              {(selectedLog.description || selectedLog.start_work_log || selectedLog.end_work_log) && (
                <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex flex-col md:flex-row gap-4">
                    {selectedLog.description && (
                      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-150 flex-1 flex flex-col">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Note / Description</div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap break-words font-medium leading-relaxed">{selectedLog.description}</p>
                      </div>
                    )}
                    {selectedLog.start_work_log && (
                      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-150 flex-1 flex flex-col">
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">🟢 Start Work Log</div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap break-words font-medium leading-relaxed">{selectedLog.start_work_log}</p>
                      </div>
                    )}
                    {selectedLog.end_work_log && (
                      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-150 flex-1 flex flex-col">
                        <div className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">🔴 End Work Log</div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap break-words font-medium leading-relaxed">{selectedLog.end_work_log}</p>
                      </div>
                    )}
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
                      <div key={shot.id} className="flex flex-col h-full border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-white">
                         <div 
                           className="cursor-pointer relative group flex-shrink-0"
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
                         
                         <div className="flex-1 p-3 flex flex-col">
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
                onClick={async () => {
                  await stopLiveSession();
                  setSelectedLog(null);
                }} 
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
                <div className="text-xs text-gray-500">
                  {new Date(selectedShot.captured_at).toLocaleString()}
                  {selectedShotIndex >= 0 && (
                    <span>{` • ${selectedShotIndex + 1} / ${logScreenshots.length}`}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (prevShot) setSelectedShot(prevShot);
                  }}
                  disabled={!prevShot}
                  className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (nextShot) setSelectedShot(nextShot);
                  }}
                  disabled={!nextShot}
                  className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button onClick={() => setSelectedShot(null)} className="px-3 py-1 text-sm rounded bg-gray-100 text-gray-700">
                  Close
                </button>
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
            {/* Header - Fixed */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 font-sans">Add Manual Time</h3>
              <button 
                onClick={() => setShowManualModal(false)} 
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close manual time modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Body - Scrollable */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              <div>
                <label className="block text-sm font-semibold text-gray-700">Project (Optional)</label>
                <select
                  value={manualForm.projectId}
                  onChange={(e) => setManualForm({ ...manualForm, projectId: e.target.value, taskId: '' })}
                  className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                >
                  <option value="">No Project</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Task (Optional)</label>
                <select
                  value={manualForm.taskId}
                  onChange={(e) => setManualForm({ ...manualForm, taskId: e.target.value })}
                  className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
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
                  <label className="block text-sm font-semibold text-gray-700">Date</label>
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Start Time</label>
                  <input
                    type="time"
                    value={manualForm.startTime}
                    onChange={(e) => setManualForm({ ...manualForm, startTime: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">End Time</label>
                  <input
                    type="time"
                    value={manualForm.endTime}
                    onChange={(e) => setManualForm({ ...manualForm, endTime: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Description</label>
                <textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  rows={3}
                  placeholder="Describe the reason for manual time entry..."
                />
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="px-6 py-4 border-t bg-gray-50 flex-shrink-0 flex justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors text-sm shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => addManualTimeMutation.mutate(manualForm)}
                disabled={addManualTimeMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:opacity-50 transition-colors text-sm shadow-sm"
              >
                {addManualTimeMutation.isPending ? 'Saving...' : 'Save Time Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && selectedLogToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-gray-100">
            {/* Header - Fixed */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 font-sans">Edit Time Log</h3>
              <button 
                onClick={() => setShowEditModal(false)} 
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close edit modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Body - Scrollable */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700">Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Start Time</label>
                  <input
                    type="time"
                    value={editForm.startTime}
                    onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700">End Time</label>
                  <input
                    type="time"
                    value={editForm.endTime}
                    onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value })}
                    className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="mt-1 block w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                  rows={3}
                  placeholder="Note / Description..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-emerald-600">🟢 Start Work Log</label>
                <textarea
                  value={editForm.startWorkLog}
                  onChange={(e) => setEditForm({ ...editForm, startWorkLog: e.target.value })}
                  className="mt-1 block w-full border border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                  rows={2}
                  placeholder="Start work log update..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-rose-600">🔴 End Work Log</label>
                <textarea
                  value={editForm.endWorkLog}
                  onChange={(e) => setEditForm({ ...editForm, endWorkLog: e.target.value })}
                  className="mt-1 block w-full border border-rose-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-mono"
                  rows={2}
                  placeholder="End work log update..."
                />
              </div>
            </div>

            {/* Footer - Fixed */}
            <div className="px-6 py-4 border-t bg-gray-50 flex-shrink-0 flex justify-end gap-3 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors text-sm shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => editTimeMutation.mutate(editForm)}
                disabled={editTimeMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold disabled:opacity-50 transition-colors text-sm shadow-sm"
              >
                {editTimeMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingNotesLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewingNotesLog(null)}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-gray-50">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-lg font-bold text-gray-900 font-sans">Note & Work Log Details</h3>
              </div>
              <button 
                onClick={() => setViewingNotesLog(null)} 
                className="p-1.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close notes modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
              {viewingNotesLog.description && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Note / Description</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(viewingNotesLog.description || '');
                        toast.success('Note copied to clipboard!');
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy Note
                    </button>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-150 text-gray-950 text-sm whitespace-pre-wrap break-words font-medium leading-relaxed shadow-inner">
                    {viewingNotesLog.description}
                  </div>
                </div>
              )}

              {viewingNotesLog.start_work_log && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">🟢 Start Work Log</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(viewingNotesLog.start_work_log || '');
                        toast.success('Start Work Log copied to clipboard!');
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy Log
                    </button>
                  </div>
                  <div className="bg-emerald-50/40 p-4 rounded-lg border border-emerald-100 text-gray-900 text-sm whitespace-pre-wrap break-words font-medium leading-relaxed shadow-inner">
                    {viewingNotesLog.start_work_log}
                  </div>
                </div>
              )}

              {viewingNotesLog.end_work_log && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">🔴 End Work Log</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(viewingNotesLog.end_work_log || '');
                        toast.success('End Work Log copied to clipboard!');
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                      Copy Log
                    </button>
                  </div>
                  <div className="bg-rose-50/40 p-4 rounded-lg border border-rose-100 text-gray-900 text-sm whitespace-pre-wrap break-words font-medium leading-relaxed shadow-inner">
                    {viewingNotesLog.end_work_log}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end flex-shrink-0">
              <button 
                onClick={() => setViewingNotesLog(null)}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-semibold shadow-md hover:shadow-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
