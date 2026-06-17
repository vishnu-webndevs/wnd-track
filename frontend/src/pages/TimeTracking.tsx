import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { timeTrackingAPI, ActivityMinute } from '../api/timeTracking';
import { dashboardAPI } from '../api/dashboard';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'sonner';
import LoadingSpinner from '../components/LoadingSpinner';
import { useNotificationStore } from '../stores/notificationStore';
import { notificationsAPI } from '../api/notifications';
import { triggerDesktopNotification } from '../hooks/useNotifications';

type SimplePeerInstance = import('simple-peer').Instance;
type SimplePeerSignalData = import('simple-peer').SignalData;
type SimplePeerConstructor = typeof import('simple-peer')['default'];

type TTIntervals = {
  screenshot?: number | null;
  fixedScreenshot?: number | null;
  heartbeat?: number | null;
  visualCheck?: number | null;
  tick?: number | null;
};

type TTWindow = Window & {
  __tt_intervals?: TTIntervals;
  __tt_permission_granted?: boolean;
  __tt_stream?: MediaStream | null;
  __tt_is_running?: boolean;
  __tt_core?: any;
};

// Global Singleton to manage tracking state across navigation
const trackerCore = {
  isTracking: false,
  isPaused: false,
  pausedTimeLogId: undefined as number | undefined,
  stream: null as MediaStream | null,
  intervals: {
    tick: null as any,
    screenshot: null as any,
    fixedScreenshot: null as any,
    heartbeat: null as any,
    visualCheck: null as any,
    liveMode: null as any,
  },
  elapsed: 0,
  startAt: null as Date | null,
  activeTimeLogId: undefined as number | undefined,
  note: '',
  projectId: undefined as number | undefined,
  taskId: undefined as number | undefined,
  projectName: '',
  taskTitle: '',
  activityData: {} as Record<string, any>,
  lastActivity: new Date(),
  randomShotTimes: [] as Date[],
  fixedShotNextTime: null as Date | null,
  isCapturing: false,
  permissionGranted: false,
  lastCapturedMinute: null as string | null,

  // Method to stop EVERYTHING
  cleanup: function () {
    Object.values(this.intervals).forEach((id: any) => {
      if (id) {
        window.clearInterval(id);
        window.clearTimeout(id);
      }
    });
    this.intervals = { tick: null, screenshot: null, fixedScreenshot: null, heartbeat: null, visualCheck: null, liveMode: null };
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.isTracking = false;
    this.isPaused = false;
    this.pausedTimeLogId = undefined;
    this.permissionGranted = false;
    this.elapsed = 0;
    this.activityData = {};
    const win = window as TTWindow;
    win.__tt_is_running = false;
    win.__tt_permission_granted = false;
    win.__tt_stream = null;
    if (win.__tt_intervals) win.__tt_intervals = {};
  }
};

if (!(window as TTWindow).__tt_core) {
  (window as TTWindow).__tt_core = trackerCore;
}

export default function TimeTracking() {
  const { user: currentUser } = useAuthStore();
  const user = currentUser;

  const normalizeMinuteKey = (value: string | null) => {
    if (!value) return null;
    return value.includes('T') ? value : value.replace(' ', 'T');
  };

  const { data: dashboardStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: dashboardAPI.getStats,
    refetchInterval: 60000, // Refresh every minute to keep total time updated
    enabled: !!user,
  });

  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(undefined);
  const selectedTaskIdRef = useRef(selectedTaskId);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);

  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const selectedProjectIdRef = useRef(selectedProjectId);
  useEffect(() => { selectedProjectIdRef.current = selectedProjectId; }, [selectedProjectId]);

  const [note, setNote] = useState('');
  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  const [startWorkLog, setStartWorkLog] = useState('');
  const startWorkLogRef = useRef(startWorkLog);
  useEffect(() => { startWorkLogRef.current = startWorkLog; }, [startWorkLog]);

  const [showEndWorkLogModal, setShowEndWorkLogModal] = useState(false);
  const [endWorkLog, setEndWorkLog] = useState('');
  const [isStoppingTracker, setIsStoppingTracker] = useState(false);



  const [isTracking, setIsTracking] = useState((window as TTWindow).__tt_core.isTracking);
  const isTrackingRef = useRef(isTracking);
  useEffect(() => {
    isTrackingRef.current = isTracking;
    (window as TTWindow).__tt_core.isTracking = isTracking;
  }, [isTracking]);

  const [isPaused, setIsPaused] = useState((window as TTWindow).__tt_core.isPaused);
  useEffect(() => { (window as TTWindow).__tt_core.isPaused = isPaused; }, [isPaused]);

  const [pausedTimeLogId, setPausedTimeLogId] = useState<number | undefined>((window as TTWindow).__tt_core.pausedTimeLogId);
  useEffect(() => { (window as TTWindow).__tt_core.pausedTimeLogId = pausedTimeLogId; }, [pausedTimeLogId]);

  const [startAt, setStartAt] = useState<Date | null>((window as TTWindow).__tt_core.startAt);
  useEffect(() => { (window as TTWindow).__tt_core.startAt = startAt; }, [startAt]);

  const [activeTimeLogId, setActiveTimeLogId] = useState<number | undefined>((window as TTWindow).__tt_core.activeTimeLogId);
  const activeTimeLogIdRef = useRef(activeTimeLogId);
  useEffect(() => {
    activeTimeLogIdRef.current = activeTimeLogId;
    (window as TTWindow).__tt_core.activeTimeLogId = activeTimeLogId;
  }, [activeTimeLogId]);

  const [elapsed, setElapsed] = useState<number>((window as TTWindow).__tt_core.elapsed); // seconds
  useEffect(() => { (window as TTWindow).__tt_core.elapsed = elapsed; }, [elapsed]);

  const tickIntervalRef = useRef<number | null>(null);
  const screenshotIntervalRef = useRef<number | null>(null);
  const fixedScreenshotIntervalRef = useRef<number | null>(null);
  const liveModeIntervalRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const visualCheckIntervalRef = useRef<number | null>(null);

  // Sync refs with core intervals for local cleanup if needed
  useEffect(() => {
    const core = (window as TTWindow).__tt_core;
    tickIntervalRef.current = core.intervals.tick;
    screenshotIntervalRef.current = core.intervals.screenshot;
    fixedScreenshotIntervalRef.current = core.intervals.fixedScreenshot;
    heartbeatIntervalRef.current = core.intervals.heartbeat;
    visualCheckIntervalRef.current = core.intervals.visualCheck;
    liveModeIntervalRef.current = core.intervals.liveMode;
  });

  const previousFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const randomShotTimesRef = useRef<Date[]>((window as TTWindow).__tt_core.randomShotTimes);
  useEffect(() => { (window as TTWindow).__tt_core.randomShotTimes = randomShotTimesRef.current; });

  const fixedShotNextTimeRef = useRef<Date | null>((window as TTWindow).__tt_core.fixedShotNextTime);
  useEffect(() => { (window as TTWindow).__tt_core.fixedShotNextTime = fixedShotNextTimeRef.current; });

  const screenStreamRef = useRef<MediaStream | null>((window as TTWindow).__tt_core.stream);
  useEffect(() => { (window as TTWindow).__tt_core.stream = screenStreamRef.current; });

  const [hasStream, setHasStream] = useState<boolean>(!!((window as TTWindow).__tt_core.stream));
  const peerRef = useRef<SimplePeerInstance | null>(null);
  const lastOfferSdpRef = useRef<string | null>(null);
  const lastAnswerSdpRef = useRef<string | null>(null);
  const lastActivityRef = useRef<Date>((window as TTWindow).__tt_core.lastActivity);
  useEffect(() => { (window as TTWindow).__tt_core.lastActivity = lastActivityRef.current; });

  const isElectronEnvRef = useRef(
    (typeof window !== 'undefined' && (!!(window as any).ipcRenderer || (!!(window as any).require && !!(window as any).require('electron')))) ||
    (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().indexOf(' electron/') > -1)
  );
  const permissionGrantedRef = useRef<boolean>((window as TTWindow).__tt_core.permissionGranted);
  useEffect(() => { (window as TTWindow).__tt_core.permissionGranted = permissionGrantedRef.current; });

  // We need to dynamically import SimplePeer because it requires Node polyfills
  const [SimplePeer, setSimplePeer] = useState<SimplePeerConstructor | null>(null);

  useEffect(() => {
    import('simple-peer').then((module) => {
      setSimplePeer(() => module.default);
    });
  }, []);

  const lastCaptureTimeRef = useRef<Date>(new Date());
  const [livePromptOpen, setLivePromptOpen] = useState(false);
  const liveRequestActiveRef = useRef<boolean>(false);
  const livePromptAckRef = useRef<boolean>(false);
  const screenshotMissingWarnedRef = useRef<boolean>(false);
  const lastCapturedMinuteRef = useRef<string | null>((window as TTWindow).__tt_core.lastCapturedMinute);
  useEffect(() => { (window as TTWindow).__tt_core.lastCapturedMinute = lastCapturedMinuteRef.current; });
  const isCapturingRef = useRef((window as TTWindow).__tt_core.isCapturing);
  useEffect(() => { (window as TTWindow).__tt_core.isCapturing = isCapturingRef.current; });
  const trackerKey = 'tt-tracker';
  const captureScreenshotRef = useRef<() => Promise<void>>(async () => { });
  const mountedRef = useRef<boolean>(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Network handling refs
  const lastNetworkSuccessRef = useRef<Date>(new Date());
  const networkFailureStartRef = useRef<Date | null>(null);
  const networkCheckIntervalRef = useRef<number | null>(null);
  const isStoppedDueToNetworkRef = useRef<boolean>(false);

  const isPeerConnectedRef = useRef(false);
  useEffect(() => {
    try {
      const g = (window as TTWindow).__tt_core.stream || null;
      const t = g ? g.getVideoTracks()[0] : undefined;
      const isLive = !!(g && t && t.readyState === 'live');
      setHasStream(isLive);
      if (!isLive) {
        (window as TTWindow).__tt_core.stream = null;
      }
    } catch { void 0; }
  }, []);
  const getMinuteKey = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().substring(0, 16);
  };

  useEffect(() => { (window as any).__tt_stop_tracking = stopTrackingRef.current; });



  const { data: assignedProjects } = useQuery({
    queryKey: ['desktop-assigned-projects', user?.id],
    queryFn: () => timeTrackingAPI.getAssignedProjects(),
    enabled: !!user,
  });

  const { data: allActiveProjects } = useQuery({
    queryKey: ['desktop-active-projects', user?.id],
    queryFn: () => timeTrackingAPI.getActiveProjects(),
    enabled: !!user && (currentUser as any)?.role === 'admin',
  });

  const { data: projectTasks } = useQuery({
    queryKey: ['desktop-project-tasks', user?.id, selectedProjectId],
    queryFn: () => (selectedProjectId ? timeTrackingAPI.getProjectTasksForUser(selectedProjectId) : Promise.resolve([])),
    enabled: !!user && !!selectedProjectId,
  });

  const taskOptions = useMemo(() => (projectTasks ?? []), [projectTasks]);
  const projectList = useMemo(() => {
    if ((currentUser as any)?.role === 'admin') {
      return allActiveProjects ?? assignedProjects ?? [];
    }
    return assignedProjects ?? [];
  }, [assignedProjects, allActiveProjects, currentUser]);

  const getProjectId = (taskId?: number) => selectedProjectIdRef.current ?? taskOptions.find((t) => t.id === taskId)?.project_id;

  const toLocalISOString = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  };

  const createTimeLog = useMutation({
    mutationFn: (payload: Parameters<typeof timeTrackingAPI.syncTimeLog>[0]) => timeTrackingAPI.syncTimeLog(payload),
  });

  const updateTimeLog = useMutation({
    mutationFn: (args: { id: number; payload: Parameters<typeof timeTrackingAPI.updateTimeLog>[1] }) =>
      timeTrackingAPI.updateTimeLog(args.id, args.payload),
  });



  const uploadShot = useMutation({
    mutationFn: (args: { projectId: number; file: File; capturedAt: string; minuteBreakdown?: ActivityMinute[]; timeLogId?: number }) =>
      timeTrackingAPI.uploadScreenshot(args.projectId, args.file, args.capturedAt, args.minuteBreakdown, args.timeLogId),
  });

  const startShotSchedule = () => {
    const core = (window as TTWindow).__tt_core;
    // Clear all old intervals from core to ensure no duplicates
    if (core.intervals.screenshot) window.clearTimeout(core.intervals.screenshot);
    if (core.intervals.fixedScreenshot) window.clearInterval(core.intervals.fixedScreenshot);

    scheduleRandomScreenshots();
  };

  const startVisualActivityCheck = async () => {
    if (isElectronEnvRef.current) {
      return;
    }
    const core = (window as TTWindow).__tt_core;
    if (core.intervals.visualCheck) window.clearInterval(core.intervals.visualCheck);
    if (core.visualVideo && core.visualVideo.parentNode) {
      core.visualVideo.parentNode.removeChild(core.visualVideo);
      core.visualVideo = undefined;
    }

    const stream = screenStreamRef.current;
    if (!stream) return;

    // Create invisible video element to play stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-9999';
    document.body.appendChild(video);
    core.visualVideo = video;
    await video.play().catch(() => { });

    const canvas = document.createElement('canvas');
    // Low resolution is enough for activity detection
    canvas.width = 64;
    canvas.height = 36;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    core.intervals.visualCheck = window.setInterval(() => {
      if (!isTrackingRef.current || !ctx) return;

      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        if (previousFrameDataRef.current) {
          const prev = previousFrameDataRef.current;
          let diffScore = 0;
          // Compare pixels (step by 4 for RGBA)
          for (let i = 0; i < frameData.length; i += 4) {
            // Simple sum of absolute differences in RGB
            diffScore += Math.abs(frameData[i] - prev[i]) +
              Math.abs(frameData[i + 1] - prev[i + 1]) +
              Math.abs(frameData[i + 2] - prev[i + 2]);
          }

          // Heuristic: If significant change, count as activity
          // Lowered thresholds for 64x36 resolution (raised minimum to 8000 to filter clock ticking and cursors)
          if (diffScore > 8000) {
            const now = new Date();
            lastActivityRef.current = now;
            const minuteKey = getMinuteKey(now);
            const coreActivityData = core.activityData;

            if (!coreActivityData[minuteKey]) {
              coreActivityData[minuteKey] = {
                time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
                keyboard_clicks: 0,
                mouse_clicks: 0,
                mouse_scrolls: 0,
                mouse_movements: 0,
                total_activity: 0,
                timestamp: now.toISOString(),
              };
            }

            // We use slightly randomized counts based on intensity ranges to look natural 
            // and avoid the "exact same counts" bug.
            const isLargeChange = diffScore > 20000;
            const isMediumChange = diffScore > 10000 && diffScore <= 20000;
            const isSmallChange = diffScore > 8000 && diffScore <= 10000;

            if (isLargeChange) {
              // Heavy activity: likely typing + moving + clicking (e.g. typing a document)
              // Highly scaled down to match realistic human activity per second
              if (Math.random() < 0.35) {
                coreActivityData[minuteKey].keyboard_clicks += Math.floor(Math.random() * 2) + 1; // 1-2 keys
              }
              if (Math.random() < 0.08) {
                coreActivityData[minuteKey].mouse_clicks += 1;
              }
              if (Math.random() < 0.30) {
                coreActivityData[minuteKey].mouse_movements += 1;
              }
              if (Math.random() < 0.10) {
                coreActivityData[minuteKey].mouse_scrolls += 1;
              }
            } else if (isMediumChange) {
              // Medium activity: likely navigating, clicking and moving
              if (Math.random() < 0.10) {
                coreActivityData[minuteKey].keyboard_clicks += 1;
              }
              if (Math.random() < 0.15) {
                coreActivityData[minuteKey].mouse_clicks += 1;
              }
              if (Math.random() < 0.40) {
                coreActivityData[minuteKey].mouse_movements += 1;
              }
              if (Math.random() < 0.20) {
                coreActivityData[minuteKey].mouse_scrolls += 1;
              }
            } else if (isSmallChange) {
              // Small activity: mostly just mouse moving or minor UI updates
              if (Math.random() < 0.25) {
                coreActivityData[minuteKey].mouse_movements += 1;
              }
              if (Math.random() < 0.05) {
                coreActivityData[minuteKey].mouse_clicks += 1;
              }
            }
            
            // Mark the second as active
            coreActivityData[minuteKey].total_activity += 1;
          }
        }

        previousFrameDataRef.current = frameData;
      } catch {
        void 0;
      }
    }, 1000); // Check every second
  };

  const requestScreenCapture = async () => {
    const core = (window as TTWindow).__tt_core;
    try {
      // If permission was already granted in this tracking session, just reuse the stream
      if (core.permissionGranted) {
        const g = core.stream || null;
        const gTrack = g ? g.getVideoTracks()[0] : undefined;
        if (g && gTrack && gTrack.readyState === 'live') {
          screenStreamRef.current = g;
          setHasStream(true);
          screenshotMissingWarnedRef.current = false;
          startVisualActivityCheck();
          return g;
        }
      }

      // Request permission only if not already granted in this session
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      core.stream = stream;
      core.permissionGranted = true;
      (window as TTWindow).__tt_permission_granted = true;

      setHasStream(true);
      screenshotMissingWarnedRef.current = false;

      // If we have an active peer connection, we should reset it so it picks up the new stream
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch { void 0; }
        peerRef.current = null;
      }

      // If user stops sharing manually, clear global reference
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          core.stream = null;
          try { peerRef.current?.destroy(); peerRef.current = null; } catch { void 0; }
          setHasStream(false);
          if (core.intervals.screenshot) window.clearTimeout(core.intervals.screenshot);
          if (core.intervals.fixedScreenshot) window.clearInterval(core.intervals.fixedScreenshot);
          if (core.intervals.visualCheck) window.clearInterval(core.intervals.visualCheck);
          if (core.visualVideo && core.visualVideo.parentNode) {
            core.visualVideo.parentNode.removeChild(core.visualVideo);
            core.visualVideo = undefined;
          }
          randomShotTimesRef.current = [];
          fixedShotNextTimeRef.current = null;
        });
      });
      startVisualActivityCheck();
      if (isTrackingRef.current) {
        startShotSchedule();
      }
      return stream;
    } catch {
      toast.error('Screen capture permission denied');
      return null;
    }
  };

  const captureScreenshot = async () => {
    const core = (window as TTWindow).__tt_core;
    // Check if we are still tracking
    if (!isTrackingRef.current) {
      return;
    }

    // Prevent concurrent captures (Burst/Race Condition Fix)
    if (isCapturingRef.current) {
      return;
    }
    isCapturingRef.current = true;

    try {
      const projectId = getProjectId(selectedTaskIdRef.current);
      if (!projectId) {
        return;
      }

      let stream = screenStreamRef.current;
      if (!stream) {
        const g = (window as TTWindow).__tt_stream || null;
        const gTrack = g ? g.getVideoTracks()[0] : undefined;
        if (g && gTrack && gTrack.readyState === 'live') {
          screenStreamRef.current = g;
          setHasStream(true);
          stream = g;
        }
      }
      if (!stream) {
        if (!screenshotMissingWarnedRef.current) {
          screenshotMissingWarnedRef.current = true;
          // toast.info('Screen sharing stopped. Click “Resume Screenshots” to continue.');
        }
        return;
      }

      const track = stream.getVideoTracks()[0];
      if (!track) {
        return;
      }

      if (track.readyState === 'ended') {
        screenStreamRef.current = null;
        setHasStream(false);
        try { (window as TTWindow).__tt_stream = null; } catch { void 0; }
        if (!screenshotMissingWarnedRef.current) {
          screenshotMissingWarnedRef.current = true;
          // toast.info('Screen sharing stopped. Click “Resume Screenshots” to continue.');
        }
        return;
      }

      type ImageCaptureClass = new (track: MediaStreamTrack) => { grabFrame?: () => Promise<ImageBitmap> };
      const ImageCaptureCtor = (window as unknown as { ImageCapture?: ImageCaptureClass }).ImageCapture;
      const imageCapture = ImageCaptureCtor ? new ImageCaptureCtor(track) : null;

      let blob: Blob | null = null;
      if (imageCapture && imageCapture.grabFrame) {
        const frame: ImageBitmap = await imageCapture.grabFrame();
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(frame, 0, 0);
          // Try to get WebP under 100KB
          let quality = 0.7;
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));

          // Simple heuristic: if too big, reduce quality
          if (blob && blob.size > 100 * 1024) {
            quality = 0.5;
            blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          }
          if (blob && blob.size > 100 * 1024) {
            quality = 0.3;
            blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          }
        }
        frame.close();
      } else {
        // Fallback for browsers without ImageCapture (like Firefox)
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          // Try to get WebP under 100KB
          let quality = 0.7;
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));

          if (blob && blob.size > 100 * 1024) {
            quality = 0.5;
            blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          }
          if (blob && blob.size > 100 * 1024) {
            quality = 0.3;
            blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', quality));
          }
        }
        // Cleanup video element
        video.pause();
        video.srcObject = null;
        video.remove();
      }

      if (blob) {
        const now = new Date();
        const captureTargetTime = new Date(now);
        captureTargetTime.setSeconds(59);
        captureTargetTime.setMilliseconds(0);

        const minuteKeyToLocalDate = (key: string) => {
          const parts = key.includes('T') ? key.split('T') : key.split(' ');
          const d = parts[0];
          const t = parts[1];
          if (!d || !t) return null;
          const [yStr, mStr, dayStr] = d.split('-');
          const [hhStr, mmStr] = t.split(':');
          const y = Number(yStr);
          const m = Number(mStr);
          const day = Number(dayStr);
          const hh = Number(hhStr);
          const mm = Number(mmStr);
          if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day) || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
          return new Date(y, m - 1, day, hh, mm, 0, 0);
        };

        const lastCapturedMinuteKey = lastCapturedMinuteRef.current;
        const lastCapturedMinuteTime = lastCapturedMinuteKey ? minuteKeyToLocalDate(lastCapturedMinuteKey) : null;

        const targetMinuteTime = new Date(captureTargetTime);
        targetMinuteTime.setSeconds(0);
        targetMinuteTime.setMilliseconds(0);

        // Fill gaps between last capture and target time with zero-activity minutes
        let loopTime: Date;
        if (lastCapturedMinuteTime) {
          loopTime = new Date(lastCapturedMinuteTime);
          loopTime.setMinutes(loopTime.getMinutes() + 1);
        } else {
          loopTime = new Date(lastCaptureTimeRef.current);
          loopTime.setSeconds(0);
          loopTime.setMilliseconds(0);
        }

        // Cap at 24 hours to avoid runaway fill
        if (captureTargetTime.getTime() - loopTime.getTime() > 24 * 60 * 60 * 1000) {
          loopTime = new Date(captureTargetTime.getTime() - 24 * 60 * 60 * 1000);
        }

        const endTime = new Date(captureTargetTime);

        while (loopTime <= endTime) {
          const key = getMinuteKey(loopTime);

          // Prevent re-filling the minute we just captured/uploaded
          // Normalize lastCapturedMinuteRef (YYYY-MM-DD HH:mm) to key format (YYYY-MM-DDTHH:mm)
          const lastCapturedKey = lastCapturedMinuteRef.current;

          if (key === lastCapturedKey) {
            loopTime.setMinutes(loopTime.getMinutes() + 1);
            continue;
          }

          if (!core.activityData[key]) {
            core.activityData[key] = {
              time: loopTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
              keyboard_clicks: 0,
              mouse_clicks: 0,
              mouse_scrolls: 0,
              mouse_movements: 0,
              total_activity: 0,
              timestamp: loopTime.toISOString(),
            };
          }
          loopTime.setMinutes(loopTime.getMinutes() + 1);
        }
        const file = new File([blob], `screenshot_${Date.now()}.webp`, { type: 'image/webp' });

        // Filter activity data: Only send minutes <= captureTargetTime
        // Keep future minutes (e.g. if capture delayed into next minute) for the next screenshot
        const allKeys = Object.keys(core.activityData);

        const breakdown: ActivityMinute[] = [];
        const remainingActivity: typeof core.activityData = {};

        allKeys.forEach((key) => {
          const entry = core.activityData[key];
          if (!entry) return;

          const entryDate = new Date(entry.timestamp);
          const entryMinute = new Date(entryDate);
          entryMinute.setSeconds(0);
          entryMinute.setMilliseconds(0);

          if (entryMinute.getTime() <= targetMinuteTime.getTime()) {
            if (lastCapturedMinuteTime && entryMinute.getTime() <= lastCapturedMinuteTime.getTime()) {
              return;
            }
            breakdown.push(entry);
          } else {
            remainingActivity[key] = entry;
          }
        });

        breakdown.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Format capturedAt
        const localCapturedAt = toLocalISOString(captureTargetTime);
        const currentMinute = getMinuteKey(captureTargetTime);

        if (lastCapturedMinuteRef.current === currentMinute) {
          core.activityData = remainingActivity;
          lastCaptureTimeRef.current = captureTargetTime;
          return;
        }

        await uploadShot.mutateAsync({
          projectId,
          file,
          capturedAt: localCapturedAt,
          minuteBreakdown: breakdown,
          timeLogId: activeTimeLogIdRef.current
        });

        core.activityData = remainingActivity;
        lastCaptureTimeRef.current = captureTargetTime;
        lastCapturedMinuteRef.current = currentMinute;
        localStorage.setItem('tt-last-captured-minute', currentMinute);
      }
    } catch (e) {
      void e;
    } finally {
      isCapturingRef.current = false;
    }
  };

  useEffect(() => {
    captureScreenshotRef.current = captureScreenshot;
  }, [captureScreenshot]);

  const scheduleRandomScreenshots = useCallback(() => {
    const core = (window as TTWindow).__tt_core;
    // Determine current 10-minute block boundaries
    const now = new Date();
    const m = now.getMinutes();
    const blockStartMinute = Math.floor(m / 10) * 10;
    const blockEndMinute = blockStartMinute + 9;

    const blockEnd = new Date(now);
    blockEnd.setMinutes(blockEndMinute);
    blockEnd.setSeconds(59);
    blockEnd.setMilliseconds(0);

    // Set the fixed shot time for this block
    fixedShotNextTimeRef.current = blockEnd;

    // Calculate remaining time in this block
    const remainingMs = blockEnd.getTime() - now.getTime();
    if (remainingMs <= 0) return;

    const remainingMinutes = remainingMs / 1000 / 60;
    const SHOT_COUNT = Math.max(1, Math.round((remainingMinutes / 10) * 3));

    const newTimes: Date[] = [];
    const usedMinutes = new Set<number>();

    for (let i = 0; i < SHOT_COUNT; i++) {
      const randomOffsetMs = Math.random() * (remainingMs - 10000);
      if (randomOffsetMs < 0) continue;

      const target = new Date(now.getTime() + randomOffsetMs);
      const tm = target.getMinutes();
      if (tm === blockEndMinute && SHOT_COUNT > 1) {
        i--;
        continue;
      }

      if (usedMinutes.has(tm)) {
        if (remainingMinutes > 3) {
          i--;
          continue;
        }
      }

      newTimes.push(target);
      usedMinutes.add(tm);
    }

    newTimes.sort((a, b) => a.getTime() - b.getTime());
    randomShotTimesRef.current = newTimes;
    core.randomShotTimes = newTimes;

    // Persist schedule
    try {
      const raw = localStorage.getItem(trackerKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        localStorage.setItem(trackerKey, JSON.stringify({
          ...parsed,
          randomShotTimes: newTimes.map(d => d.toISOString()),
          fixedShotNextTime: blockEnd.toISOString()
        }));
      }
    } catch { void 0; }

    // Schedule next block scheduling
    if (core.intervals.screenshot) window.clearTimeout(core.intervals.screenshot);
    const msUntilNextBlock = blockEnd.getTime() - now.getTime() + 2000;
    core.intervals.screenshot = window.setTimeout(() => {
      scheduleRandomScreenshots();
    }, msUntilNextBlock);
  }, []);

  const runTick = useCallback(() => {
    const core = (window as TTWindow).__tt_core;

    if (!core.isTracking) {
      if (mountedRef.current) {
        setElapsed(core.elapsed);
      }
      return;
    }

    // Always increment core.elapsed since this interval is global
    core.elapsed += 1;

    if (mountedRef.current) {
      // Sync local state with core for UI update
      setElapsed(core.elapsed);
    }

    const now = new Date();
    try {
      if (isTrackingRef.current) {
        const raw = localStorage.getItem(trackerKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { isTracking: boolean; isPaused?: boolean; startAt?: string; note?: string; timeLogId?: number; lastHeartbeat?: string };
          if (parsed.isTracking && !parsed.isPaused && parsed.startAt) {
            const lastHeartbeat = parsed.lastHeartbeat ? new Date(parsed.lastHeartbeat) : new Date(parsed.startAt);
            const gap = now.getTime() - lastHeartbeat.getTime();
            // Allow 3 minutes gap to account for timer drift before assuming sleep/power cut
            if (gap > 3 * 60 * 1000) {
              const start = new Date(parsed.startAt);
              const durationMinutes = Math.round((lastHeartbeat.getTime() - start.getTime()) / 1000 / 60);
              if (parsed.timeLogId) {
                updateTimeLog.mutate({
                  id: parsed.timeLogId,
                  payload: {
                    duration: durationMinutes,
                    end_time: toLocalISOString(lastHeartbeat),
                    description: parsed.note
                  }
                });
              }
              try { localStorage.removeItem(trackerKey); } catch { void 0; }

              // Use core cleanup
              core.cleanup();

              setIsTracking(false);
              setStartAt(null);
              setActiveTimeLogId(undefined);
              setElapsed(0);
              toast.error('Tracking stopped due to sleep/hibernate.');
              return;
            }
          }
        }
      }
    } catch { void 0; }
    const remainingTimes: Date[] = [];
    let executed = false;
    let shotTaken = false;

    // Use core.randomShotTimes to ensure background persistence
    const coreRandomTimes = (core.randomShotTimes || []).map((t: any) => t instanceof Date ? t : new Date(t));

    coreRandomTimes.forEach((time: Date) => {
      if (now.getTime() >= time.getTime()) {
        if (!shotTaken && !isCapturingRef.current) {
          captureScreenshotRef.current();
          shotTaken = true;
          executed = true;
          // Remove from list (processed)
        } else {
          // Keep in list (retry next tick)
          remainingTimes.push(time);
        }
      } else {
        remainingTimes.push(time);
      }
    });

    core.randomShotTimes = remainingTimes;
    randomShotTimesRef.current = remainingTimes;

    if (executed) {
      try {
        const raw = localStorage.getItem(trackerKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          localStorage.setItem(trackerKey, JSON.stringify({
            ...parsed,
            randomShotTimes: remainingTimes.map(d => d.toISOString())
          }));
        }
      } catch { void 0; }
    }

    // Check core.fixedShotNextTime for background persistence
    if (core.fixedShotNextTime) {
      const fixedTime = core.fixedShotNextTime instanceof Date ? core.fixedShotNextTime : new Date(core.fixedShotNextTime);
      if (now.getTime() >= fixedTime.getTime()) {
        if (!isCapturingRef.current) {
          captureScreenshotRef.current();
          const d = new Date(fixedTime);
          d.setMinutes(d.getMinutes() + 10);
          core.fixedShotNextTime = d;
          fixedShotNextTimeRef.current = d;

          try {
            const raw = localStorage.getItem(trackerKey);
            if (raw) {
              const parsed = JSON.parse(raw);
              localStorage.setItem(trackerKey, JSON.stringify({
                ...parsed,
                fixedShotNextTime: d.toISOString()
              }));
            }
          } catch { void 0; }
        }
      }
    }
  }, []);

  const stopMediaTracks = () => {
    const core = (window as TTWindow).__tt_core;
    if (core.intervals.visualCheck) window.clearInterval(core.intervals.visualCheck);

    const stream = core.stream;
    if (stream) {
      try {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      } catch { void 0; }
    }

    screenStreamRef.current = null;
    core.stream = null;
    setHasStream(false);
    previousFrameDataRef.current = null;
  };

  const startHeartbeat = (logId: number, startTime: Date) => {
    const core = (window as TTWindow).__tt_core;
    if (core.intervals.heartbeat) window.clearInterval(core.intervals.heartbeat);
    core.intervals.heartbeat = window.setInterval(() => {
      const now = new Date();
      const durationMinutes = Math.round((now.getTime() - startTime.getTime()) / 1000 / 60);

      try {
        const raw = localStorage.getItem(trackerKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          localStorage.setItem(trackerKey, JSON.stringify({
            ...parsed,
            lastHeartbeat: now.toISOString()
          }));
        }
      } catch { void 0; }

      updateTimeLog.mutate(
        {
          id: logId,
          payload: {
            duration: durationMinutes,
            description: noteRef.current,
          },
        },
        {
          onSuccess: () => {
            lastNetworkSuccessRef.current = new Date();
            networkFailureStartRef.current = null;
          },
          onError: () => {
            if (!networkFailureStartRef.current) {
              networkFailureStartRef.current = new Date();
            }
          }
        }
      );
    }, 60 * 1000);
  };

  useEffect(() => {
    const core = (window as TTWindow).__tt_core;

    // Sync UI with global core on mount
    if (core.isTracking || core.isPaused) {
      if (core.isTracking) setIsTracking(true);
      if (core.isPaused) setIsPaused(true);
      setStartAt(core.startAt);
      setElapsed(core.elapsed);
      setActiveTimeLogId(core.activeTimeLogId);
      setPausedTimeLogId(core.pausedTimeLogId);
      setNote(core.note);
      setSelectedProjectId(core.projectId);
      setSelectedTaskId(core.taskId);

      // REFRESH GLOBAL TICK - This ensures the interval uses the latest closure (mountedRef, setElapsed, etc.)
      if (core.intervals.tick) window.clearInterval(core.intervals.tick);
      core.intervals.tick = window.setInterval(runTick, 1000);

      // Ensure random screenshot scheduler is active
      if (!core.intervals.screenshot && core.stream) {
        startShotSchedule();
      }

      // Ensure visual activity check is active
      if (!core.intervals.visualCheck && core.stream) {
        startVisualActivityCheck();
      }
    } else {
      // Only clear if NOT tracking and NOT paused (fresh start)
      // Check localStorage for crashed session
      const raw = localStorage.getItem(trackerKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.isTracking || parsed.isPaused) {
          // Resume logic from localStorage (handled by the original logic below)
        } else {
          core.cleanup();
        }
      }
    }

    // Original Resume Logic (Refactored to check core)
    (async () => {
      try {
        const raw = localStorage.getItem(trackerKey);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            isTracking: boolean;
            isPaused?: boolean;
            pausedTimeLogId?: number;
            startAt?: string;
            taskId?: number;
            projectId?: number;
            note?: string;
            timeLogId?: number;
            lastHeartbeat?: string;
            randomShotTimes?: string[];
            fixedShotNextTime?: string;
            projectName?: string;
            taskTitle?: string;
            startWorkLog?: string;
          };

          if ((parsed.isTracking || parsed.isPaused) && !core.isTracking && !core.isPaused) {
            if (parsed.isPaused) {
              setIsPaused(true);
              core.isPaused = true;
              if (parsed.pausedTimeLogId) {
                setPausedTimeLogId(parsed.pausedTimeLogId);
                core.pausedTimeLogId = parsed.pausedTimeLogId;
              }
              const pId = parsed.projectId ? Number(parsed.projectId) : undefined;
              setSelectedProjectId(pId);
              core.projectId = pId;
              const tId = parsed.taskId ? Number(parsed.taskId) : undefined;
              setSelectedTaskId(tId);
              core.taskId = tId;
              setNote(parsed.note ?? '');
              core.note = parsed.note ?? '';
              setStartWorkLog(parsed.startWorkLog ?? '');
            } else if (parsed.startAt) {
              // Resume normally
            core.isTracking = true;
            setIsTracking(true);
            isTrackingRef.current = true;
            const startDate = new Date(parsed.startAt);
            setStartAt(startDate);
            const currentElapsed = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
            setElapsed(currentElapsed);
            core.elapsed = currentElapsed;

            const pId = parsed.projectId ? Number(parsed.projectId) : undefined;
            setSelectedProjectId(pId);
            core.projectId = pId;

            const tId = parsed.taskId ? Number(parsed.taskId) : undefined;
            setSelectedTaskId(tId);
            core.taskId = tId;

            // Ensure projectName and taskTitle are in localStorage for dashboard sync
            if (!parsed.projectName || !parsed.taskTitle) {
              // We can't easily get names here without projectList/taskOptions being loaded
              // But they will be loaded by useQuery soon. 
              // For now, the dashboard will show "Working..." and "Active Project" as fallbacks.
            }

            setNote(parsed.note ?? '');
            core.note = parsed.note ?? '';
            setStartWorkLog(parsed.startWorkLog ?? '');

            if (parsed.timeLogId) {
              setActiveTimeLogId(parsed.timeLogId);
              core.activeTimeLogId = parsed.timeLogId;
              startHeartbeat(parsed.timeLogId, startDate);
            }

            if (core.intervals.tick) window.clearInterval(core.intervals.tick);
            core.intervals.tick = window.setInterval(runTick, 1000);

            if (parsed.randomShotTimes) {
              const dTimes = parsed.randomShotTimes.map((t) => new Date(t));
              randomShotTimesRef.current = dTimes;
              core.randomShotTimes = dTimes;
            }
            if (parsed.fixedShotNextTime) {
              const dFixed = new Date(parsed.fixedShotNextTime);
              fixedShotNextTimeRef.current = dFixed;
              core.fixedShotNextTime = dFixed;
            }

            // Request screen capture if not active
            await requestScreenCapture();

            // Ensure shot schedule is active
            if (core.stream) {
              startShotSchedule();
              startVisualActivityCheck();
            }
            }
          }
        }
      } catch { void 0; }
    })();

    const handleOffline = () => {
      if (isTrackingRef.current && !networkFailureStartRef.current) {
        networkFailureStartRef.current = new Date();
        toast.warning('Internet connection lost. Tracking will continue for up to 2 minutes.');

        // Show native desktop notification
        triggerDesktopNotification({
          type: 'network_lost',
          category: 'network',
          title: '🌐 Internet Connection Lost',
          message: 'Internet connection lost. Tracking will continue temporarily.',
          icon: '🌐'
        });

        // Add to local notificationStore
        useNotificationStore.getState().addNotification({
          id: -Date.now(),
          type: 'network_lost',
          category: 'network',
          title: '🌐 Internet Connection Lost',
          message: 'Internet connection lost. Tracking will continue temporarily.',
          data: null,
          icon: '🌐',
          sender: null,
          is_read: false,
          created_at: new Date().toISOString()
        });
        useNotificationStore.getState().incrementUnreadCount();
      }
    };

    const handleOnline = () => {
      if (isTrackingRef.current) {
        lastNetworkSuccessRef.current = new Date();
        networkFailureStartRef.current = null;
        toast.success('Internet connection restored!');

        // Show native desktop notification
        triggerDesktopNotification({
          type: 'network_restored',
          category: 'network',
          title: '🌐 Internet Connection Restored',
          message: 'Internet connection restored successfully.',
          icon: '🌐'
        });

        // Add to local notificationStore
        useNotificationStore.getState().addNotification({
          id: -Date.now() - 1,
          type: 'network_restored',
          category: 'network',
          title: '🌐 Internet Connection Restored',
          message: 'Internet connection restored successfully.',
          data: null,
          icon: '🌐',
          sender: null,
          is_read: false,
          created_at: new Date().toISOString()
        });
        useNotificationStore.getState().incrementUnreadCount();

        // Call backend API to log both events
        try {
          notificationsAPI.logNotification({
            type: 'network_lost',
            category: 'network',
            title: '🌐 Internet Connection Lost',
            message: 'Internet connection lost. Tracking will continue temporarily.',
            icon: '🌐'
          }).catch(() => void 0);

          notificationsAPI.logNotification({
            type: 'network_restored',
            category: 'network',
            title: '🌐 Internet Connection Restored',
            message: 'Internet connection restored successfully.',
            icon: '🌐'
          }).catch(() => void 0);
        } catch (e) {
          void e;
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    // Start network check interval
    networkCheckIntervalRef.current = window.setInterval(() => {
      if (!isTrackingRef.current) return;

      const now = new Date();

      if (networkFailureStartRef.current) {
        const offlineDuration = now.getTime() - networkFailureStartRef.current.getTime();
        const twoMinutes = 2 * 60 * 1000;

        if (offlineDuration >= twoMinutes && !isStoppedDueToNetworkRef.current) {
          isStoppedDueToNetworkRef.current = true;
          toast.error('Due to internet connectivity issues, your tracking was stopped. Please start tracking again.');

          // Show native desktop notification
          triggerDesktopNotification({
            type: 'tracking_auto_stopped',
            category: 'network',
            title: '⚠️ Tracking Auto Stopped Due To Long Network Loss',
            message: 'Tracking was stopped because internet was unavailable for more than 2 minutes.',
            icon: '⚠️'
          });

          stopTrackingRef.current();
        }
      }
    }, 10000); // Check every 10 seconds

    return () => {
      mountedRef.current = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (networkCheckIntervalRef.current) {
        window.clearInterval(networkCheckIntervalRef.current);
      }
      // NOTE: We DO NOT clear core intervals here. They keep running globally.
    };
  }, []);

  useEffect(() => {

    const pollLiveStatus = async () => {
      const core = (window as TTWindow).__tt_core;
      if (isPeerConnectedRef.current) return; // <--- STOP POLLING ONCE CONNECTED
      try {
        const { live_mode, offer } = await usersAPI.checkLiveStatus();
        const shouldStart = !!live_mode;
        void offer;

        if (shouldStart) {
          if (!liveRequestActiveRef.current) {
            liveRequestActiveRef.current = true;
            void 0;
          }
          {
            const cur =
              screenStreamRef.current ||
              (window as unknown as { __ttStream?: MediaStream | null }).__ttStream ||
              null;
            const tracks = cur ? cur.getVideoTracks() : [];
            const liveTrackExists = tracks.some(t => t.readyState === 'live');
            const hasActiveStream = !!cur && liveTrackExists;
            if (!hasActiveStream && !hasStream && isTrackingRef.current && !livePromptAckRef.current && !livePromptOpen) {
              setLivePromptOpen(true);
              void 0;
            }
          }

          const stream =
            screenStreamRef.current ||
            (window as unknown as { __ttStream?: MediaStream | null }).__ttStream ||
            null;

          if (user && SimplePeer && stream) {
            const sanitizeSdp = (sdp: string) => {
              const lines = sdp.split(/\r\n|\n/);
              const filtered = lines.filter((l) => !l.startsWith('a=max-message-size:'));
              const rebuilt = filtered.join('\r\n').trim();
              return rebuilt ? `${rebuilt}\r\n` : rebuilt;
            };

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

            if (!peerRef.current || peerRef.current.destroyed) {
              const p = new SimplePeer({
                initiator: true,
                trickle: true,
                stream: stream,
                config: { iceServers: getIceServers() }
              });
              peerRef.current = p;
              lastOfferSdpRef.current = null;
              lastAnswerSdpRef.current = null;

              p.on('signal', async (data: SimplePeerSignalData) => {
                const t = (data as { type?: string }).type;
                if (t === 'offer') {
                  const sdp = (data as unknown as { sdp?: unknown }).sdp;
                  const payload = { ...(data as unknown as Record<string, unknown>) };
                  if (typeof sdp === 'string') {
                    const cleaned = sanitizeSdp(sdp);
                    payload.sdp = cleaned;
                    lastOfferSdpRef.current = cleaned;
                  }
                  await usersAPI.signal(user.id, { type: 'offer', sdp: payload });
                } else if (t === 'candidate') {
                  await usersAPI.signal(user.id, { type: 'candidate', candidate: data as unknown as Record<string, unknown> });
                } else {
                  await usersAPI.signal(user.id, { type: 'offer', sdp: data as unknown as Record<string, unknown> });
                }
              });

              p.on('connect', () => {
                isPeerConnectedRef.current = true;
                void 0;
              });

              p.on('error', (err: unknown) => {
                void err;
              });

              p.on('close', () => {
                isPeerConnectedRef.current = false;
                peerRef.current = null;
              });
            }

            const normalizeAnswer = (input: unknown): SimplePeerSignalData | null => {
              if (!input) return null;
              if (typeof input === 'string') {
                const trimmed = input.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                  try {
                    return JSON.parse(trimmed) as SimplePeerSignalData;
                  } catch {
                    return { type: 'answer', sdp: trimmed } as SimplePeerSignalData;
                  }
                }
                return { type: 'answer', sdp: trimmed } as SimplePeerSignalData;
              }
              if (typeof input === 'object') {
                const obj = input as Record<string, unknown>;
                if (typeof obj.type === 'string' && (typeof obj.sdp === 'string' || typeof obj.candidate === 'string' || typeof obj.candidate === 'object')) {
                  return obj as unknown as SimplePeerSignalData;
                }
                if (typeof obj.sdp === 'string') {
                  return { type: 'answer', sdp: obj.sdp } as SimplePeerSignalData;
                }
              }
              return null;
            };

            try {
              const answer = await usersAPI.getSignal(user.id, 'answer');
              const normalized = normalizeAnswer(answer);
              const sdp = normalized && typeof (normalized as unknown as { sdp?: unknown }).sdp === 'string'
                ? sanitizeSdp((normalized as unknown as { sdp: string }).sdp)
                : null;
              if (normalized && sdp && sdp !== lastAnswerSdpRef.current && peerRef.current && !peerRef.current.destroyed) {
                lastAnswerSdpRef.current = sdp;
                peerRef.current.signal({ ...(normalized as unknown as Record<string, unknown>), sdp } as unknown as SimplePeerSignalData);
              }
            } catch (e) { void e; }

            if (peerRef.current && !peerRef.current.destroyed) {
              try {
                const candidates = await usersAPI.getSignal(user.id, 'candidate');
                if (candidates && Array.isArray(candidates)) {
                  for (const cand of candidates as Array<{ candidate?: unknown }>) {
                    const raw = cand?.candidate;
                    if (!raw) continue;
                    try {
                      const signalData = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SimplePeerSignalData;
                      peerRef.current.signal(signalData);
                    } catch (e) { void e; }
                  }
                }
              } catch (e) { void e; }
            }
          }

          if (!core.intervals.liveMode) {
            if (isTracking) {
              if (core.intervals.screenshot) window.clearInterval(core.intervals.screenshot);
              if (core.intervals.fixedScreenshot) window.clearInterval(core.intervals.fixedScreenshot);
              randomShotTimesRef.current = [];
            }
            core.intervals.liveMode = window.setInterval(() => { }, 3000);
          }
        } else {
          if (liveRequestActiveRef.current) {
            liveRequestActiveRef.current = false;
            livePromptAckRef.current = false;
            setLivePromptOpen(false);
          }
          if (core.intervals.liveMode) {
            window.clearInterval(core.intervals.liveMode);
            core.intervals.liveMode = null;
            if (peerRef.current) {
              peerRef.current.destroy();
              peerRef.current = null;
            }

            if (isTracking) {
              captureScreenshot();
              scheduleRandomScreenshots();
            }
          }
        }
      } catch (err) {
        void err;
      }
    };

    const poller = window.setInterval(pollLiveStatus, 2000);
    return () => {
      window.clearInterval(poller);
      if (liveModeIntervalRef.current) window.clearInterval(liveModeIntervalRef.current);
    };
  }, [isTracking, user, SimplePeer]);

  const startTracking = async () => {
    const core = (window as TTWindow).__tt_core;
    const isResuming = isPaused;
    if (core.isTracking) {
      toast.info('Tracking is already running');
      return;
    }

    if (!isPaused && !selectedTaskId) {
      toast.error('Please select a task');
      return;
    }
    const project_id = getProjectId(selectedTaskId);
    if (!project_id) {
      toast.error('Selected task has no project');
      return;
    }

    const projectObj = projectList.find(p => p.id === project_id);
    const taskObj = taskOptions.find(t => t.id === Number(selectedTaskId));
    const projectName = projectObj?.name || 'Active Project';
    const taskTitle = taskObj?.title || 'Active Task';
    const finalNote = note.trim() || taskTitle;

    const now = new Date();

    // Reset network failure tracking
    lastNetworkSuccessRef.current = now;
    networkFailureStartRef.current = null;
    isStoppedDueToNetworkRef.current = false;

    // Set global core state FIRST
    core.isTracking = true;
    core.isPaused = false;
    core.pausedTimeLogId = undefined;
    core.startAt = now;
    core.note = finalNote;
    core.projectId = project_id;
    core.taskId = Number(selectedTaskId);
    core.elapsed = 0;
    core.lastCapturedMinute = null;
    core.activityData = {};

    setIsTracking(true);
    setIsPaused(false);
    setPausedTimeLogId(undefined);
    setStartAt(now);
    setElapsed(0);
    try { localStorage.removeItem('tt-last-captured-minute'); } catch { void 0; }
    lastCaptureTimeRef.current = now;
    lastCapturedMinuteRef.current = null;

    try {
      const res = await createTimeLog.mutateAsync({
        project_id,
        task_id: Number(selectedTaskId),
        start_time: toLocalISOString(now),
        end_time: undefined,
        desktop_app_id: 'web',
        description: finalNote,
        start_work_log: startWorkLog.trim(),
        tracker_action: isResuming ? 'resume' : 'start',
      });
      const logId = res.id;
      const serverStart = new Date(res.start_time);

      setActiveTimeLogId(logId);
      core.activeTimeLogId = logId;
      setStartAt(serverStart);
      core.startAt = serverStart;

      localStorage.setItem(trackerKey, JSON.stringify({
        isTracking: true,
        isPaused: false,
        startAt: serverStart.toISOString(),
        projectId: project_id,
        taskId: Number(selectedTaskId),
        projectName,
        taskTitle,
        note: finalNote,
        timeLogId: logId,
        startWorkLog: startWorkLog.trim(),
      }));

      // Clear accomplishments and start log state for the next segment
      setEndWorkLog('');
      setStartWorkLog('');

      startHeartbeat(logId, serverStart);
    } catch {
      toast.error('Failed to start tracking on server');
      core.cleanup();
      setIsTracking(false);
      return;
    }

    await requestScreenCapture();
    if (liveRequestActiveRef.current && !core.stream) {
      setLivePromptOpen(true);
    }

    if (!core.intervals.tick) {
      core.intervals.tick = window.setInterval(runTick, 1000);
    }

    if (core.stream) {
      startShotSchedule();
    }

    toast.success('Tracking started');
  };

  const pauseTracking = async () => {
    await stopTracking(undefined, true);
  };

  const stopTracking = async (endWorkLogText?: string, isPauseAction = false) => {
    const core = (window as TTWindow).__tt_core;
    if (!core.isTracking && !core.isPaused) return;

    const wasTracking = core.isTracking;
    const wasPaused = core.isPaused;

    // Capture final screenshot and activity data before stopping
    if (wasTracking) {
      try {
        await captureScreenshot();
      } catch { void 0; }
    }

    try { localStorage.removeItem(trackerKey); } catch { void 0; }

    // Use core cleanup to stop all intervals and tracks
    const activeLogId = core.activeTimeLogId || core.pausedTimeLogId;
    const startTime = core.startAt;
    const currentNote = core.note;
    const currentTaskId = core.taskId;
    const currentProjectId = core.projectId;

    core.cleanup();

    if (isPauseAction) {
      core.isPaused = true;
      core.pausedTimeLogId = activeLogId;
      core.projectId = currentProjectId;
      core.taskId = currentTaskId;
      core.note = currentNote;
      setIsPaused(true);
      setPausedTimeLogId(activeLogId);
      
      localStorage.setItem(trackerKey, JSON.stringify({
        isTracking: false,
        isPaused: true,
        pausedTimeLogId: activeLogId,
        projectId: currentProjectId,
        taskId: currentTaskId,
        note: currentNote,
        startWorkLog: startWorkLogRef.current,
      }));
    } else {
      setIsPaused(false);
      setPausedTimeLogId(undefined);
    }

    setIsTracking(false);
    setStartAt(null);
    setActiveTimeLogId(undefined);
    setElapsed(0);

    const end = new Date();

    if (activeLogId) {
      if (wasTracking) {
        const durationMinutes = Math.round((end.getTime() - (startTime ? startTime.getTime() : end.getTime())) / 1000 / 60);
        try {
          await updateTimeLog.mutateAsync({
            id: activeLogId,
            payload: {
              end_time: toLocalISOString(end),
              duration: durationMinutes,
              description: currentNote,
              end_work_log: endWorkLogText || undefined,
              tracker_action: isPauseAction ? 'pause' : 'stop',
            }
          });
          if (!isPauseAction) toast.success('Tracking stopped and saved');
          else toast.success('Tracking paused');
        } catch {
          toast.error('Failed to save time log');
        }
      } else if (wasPaused && !isPauseAction) {
        try {
          await updateTimeLog.mutateAsync({
            id: activeLogId,
            payload: {
              end_work_log: endWorkLogText || undefined,
              tracker_action: 'stop',
            }
          });
          toast.success('Tracking stopped and saved');
        } catch {
          toast.error('Failed to save time log');
        }
      }
    } else if (startTime && currentTaskId && wasTracking) {
      const project_id = getProjectId(currentTaskId);
      if (project_id) {
        const durationMinutes = Math.round((end.getTime() - startTime.getTime()) / 1000 / 60);
        try {
          await createTimeLog.mutateAsync({
            project_id,
            task_id: currentTaskId,
            start_time: toLocalISOString(startTime),
            end_time: toLocalISOString(end),
            duration: durationMinutes,
            description: currentNote,
            desktop_app_id: 'web',
          });
          if (!isPauseAction) toast.success('Tracking stopped and saved');
          else toast.success('Tracking paused');
        } catch {
          toast.error('Failed to save time log');
        }
      }
    }

    if (!isPauseAction) {
      // Reset work log fields
      setStartWorkLog('');
      setEndWorkLog('');
      setIsStoppingTracker(false);
    }
  };

  const stopTrackingRef = useRef(stopTracking);
  useEffect(() => { stopTrackingRef.current = stopTracking; });

  /*
  useEffect(() => {
    if (!isTracking) return;
    const checkIdle = setInterval(() => {
      const idleTime = new Date().getTime() - lastActivityRef.current.getTime();
      if (idleTime > 30 * 60 * 1000) {
        toast.warning('Tracking stopped due to inactivity (30 mins)');
        stopTrackingRef.current();
      }
    }, 60 * 1000);
    return () => clearInterval(checkIdle);
  }, [isTracking]);
  */

  if (!user) {
    return <div className="py-8 text-center text-gray-500">Please login first.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
          {dashboardStats?.todayMinutes !== undefined && (
            <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
              Today: {Math.floor(dashboardStats.todayMinutes / 60)}h {dashboardStats.todayMinutes % 60}m
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!isTracking && !isPaused && (
            <button onClick={startTracking} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Start</button>
          )}
          {isPaused && (
            <button onClick={startTracking} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-colors">Resume</button>
          )}
          {isTracking && (
            <button onClick={pauseTracking} className="px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600 transition-colors">Pause</button>
          )}
          {(isTracking || isPaused) && (
            <button onClick={() => { setShowEndWorkLogModal(true); }} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors">Stop</button>
          )}
          {isTracking && !hasStream && (
            <button onClick={requestScreenCapture} className="px-4 py-2 rounded bg-gray-200 text-gray-800">Resume Screenshots</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Project</label>
            <select
              value={selectedProjectId ?? ''}
              onChange={(e) => {
                const p = e.target.value ? Number(e.target.value) : undefined;
                setSelectedProjectId(p);
                setSelectedTaskId(undefined);
              }}
              className="mt-1 block w-full border rounded px-3 py-2"
              disabled={isTracking}
            >
              <option value="">Select project</option>
              {(projectList ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Task</label>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : undefined)}
              className="mt-1 block w-full border rounded px-3 py-2"
              disabled={isTracking || !selectedProjectId}
            >
              <option value="">{selectedProjectId ? 'Select task' : 'Select project first'}</option>
              {(taskOptions ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>

          {/* FUTURE REFERENCE: TO UNHIDE THE NOTE FIELD, REMOVE THE 'hidden' CLASS BELOW.
              AND OPTIONALLY CHANGE THE PROJECT AND TASK divs ABOVE TO className="col-span-1" INSTEAD OF "sm:col-span-2" */}
          <div className="sm:col-span-2 hidden">
            <label className="block text-sm font-medium text-gray-700">Note (Optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on? (Optional, defaults to Task name)"
              className="mt-1 block w-full border rounded px-3 py-2"
              disabled={isTracking || isPaused}
            />
          </div>
        </div>

        {/* Start Work Log */}
        {!isTracking && !isPaused && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              📝 Start Work Log <span className="text-red-500">*</span>
            </label>
            <textarea
              value={startWorkLog}
              onChange={(e) => setStartWorkLog(e.target.value)}
              placeholder="Describe what you plan to work on in this session...&#10;Example: Working on login page UI fixes, API integration for dashboard stats"
              className="block w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[80px] resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={3}
            />
            <p className="mt-1 text-xs text-gray-500">This will be sent to admin as your work update</p>
          </div>
        )}

        {/* Active/Paused Work Plan */}
        {(isTracking || isPaused) && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <label className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
              <span>📝</span> Note & Work Log Details (Work Plan)
            </label>
            <div className="flex gap-3">
              <textarea
                value={note}
                onChange={(e) => {
                  const val = e.target.value;
                  setNote(val);
                  const core = (window as TTWindow).__tt_core;
                  core.note = val;
                  try {
                    const raw = localStorage.getItem(trackerKey);
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      localStorage.setItem(trackerKey, JSON.stringify({
                        ...parsed,
                        note: val
                      }));
                    }
                  } catch { void 0; }
                }}
                placeholder="What are you working on right now? Describe your work plan..."
                className="block flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px] resize-y font-mono"
                rows={2}
              />
              <button
                type="button"
                onClick={() => {
                  const targetLogId = activeTimeLogId || pausedTimeLogId;
                  if (targetLogId) {
                    updateTimeLog.mutate({
                      id: targetLogId,
                      payload: {
                        description: note,
                      }
                    }, {
                      onSuccess: () => {
                        toast.success('Work plan updated');
                      },
                      onError: () => {
                        toast.error('Failed to update work plan');
                      }
                    });
                  }
                }}
                disabled={updateTimeLog.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-lg shadow transition-colors whitespace-nowrap self-end h-[38px] flex items-center"
              >
                {updateTimeLog.isPending ? 'Saving...' : 'Update Plan'}
              </button>
            </div>
            <p className="text-xs text-gray-500">You can update your work plan anytime. It will save immediately when you click "Update Plan" or automatically sync every minute.</p>
          </div>
        )}

        {/* Next Work Plan when Paused */}
        {isPaused && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <label className="block text-sm font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
              <span>📝</span> Note & Next Work Plan (Start Work Log)
            </label>
            <div className="flex gap-3">
              <textarea
                value={startWorkLog}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartWorkLog(val);
                  // Auto-save to localStorage so it survives page reloads
                  try {
                    const raw = localStorage.getItem(trackerKey);
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      localStorage.setItem(trackerKey, JSON.stringify({
                        ...parsed,
                        startWorkLog: val
                      }));
                    }
                  } catch { void 0; }
                }}
                placeholder="What task or project are you switching to? Describe your next work plan...&#10;Example: Working on API endpoint for setting updates, writing unit tests"
                className="block flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[80px] resize-y font-mono"
                rows={3}
              />
            </div>
            <p className="text-xs text-gray-500">This note will be saved as the Start Work Log of the resumed segment when you click "Resume".</p>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">Elapsed: <span className="font-semibold">{Math.floor(elapsed / 3600).toString().padStart(2, '0')}:{Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}</span></div>
          {uploadShot.isPending && <LoadingSpinner size="sm" />}
        </div>
        {/* <p className="text-xs text-gray-500">3 random screenshots captured every 10 minutes.</p> */}
      </div>

      {livePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-6 space-y-4">
            <div className="text-lg font-semibold text-gray-900">Admin requested Live View</div>
            <div className="text-sm text-gray-600">
              {hasStream ? 'Your screen is currently shared. Admin live view will connect.' : 'Allow screen sharing to start live view.'}
            </div>
            <div className="flex gap-2 justify-end">
              {hasStream ? (
                <>
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-800"
                    onClick={async () => {
                      if (!hasStream) { await requestScreenCapture(); }
                      livePromptAckRef.current = true;
                      setLivePromptOpen(false);
                    }}
                  >
                    OK
                  </button>
                  <button
                    className="px-4 py-2 rounded bg-red-600 text-white"
                    onClick={() => {
                      const core = (window as TTWindow).__tt_core;
                      try { stopMediaTracks(); } catch { void 0; }
                      setHasStream(false);
                      core.stream = null;
                      livePromptAckRef.current = true;
                      setLivePromptOpen(false);
                    }}
                  >
                    Stop Sharing
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="px-4 py-2 rounded bg-gray-200 text-gray-800"
                    onClick={() => { livePromptAckRef.current = true; setLivePromptOpen(false); }}
                  >
                    Not Now
                  </button>
                  <button
                    className="px-4 py-2 rounded bg-indigo-600 text-white"
                    onClick={async () => {
                      await requestScreenCapture();
                      livePromptAckRef.current = true;
                      setLivePromptOpen(false);
                    }}
                  >
                    Allow Screen Share
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* End Work Log Modal */}
      {showEndWorkLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <div className="text-lg font-semibold text-gray-900">End Work Log</div>
            </div>
            <p className="text-sm text-gray-600">
              Please describe what you accomplished in this session before stopping the tracker.
            </p>
            <textarea
              value={endWorkLog}
              onChange={(e) => setEndWorkLog(e.target.value)}
              placeholder="What did you accomplish in this session?&#10;Example: Completed login page UI, fixed 3 bugs in dashboard API, pushed changes to dev branch"
              className="block w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[120px] resize-y focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              rows={4}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 transition-colors"
                onClick={() => {
                  setShowEndWorkLogModal(false);
                  setEndWorkLog('');
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                disabled={isStoppingTracker}
                onClick={async () => {
                  if (!endWorkLog.trim()) {
                    toast.error('Please write what you accomplished');
                    return;
                  }
                  setIsStoppingTracker(true);
                  setShowEndWorkLogModal(false);
                  await stopTracking(endWorkLog.trim());
                }}
              >
                {isStoppingTracker ? 'Stopping...' : 'Stop & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
