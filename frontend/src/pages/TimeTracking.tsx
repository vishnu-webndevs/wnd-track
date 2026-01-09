import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { timeTrackingAPI, ActivityMinute } from '../api/timeTracking';
import { tasksAPI } from '../api/tasks';
import { projectsAPI } from '../api/projects';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'sonner';
import LoadingSpinner from '../components/LoadingSpinner';

type SimplePeerInstance = import('simple-peer').Instance;
type SimplePeerSignalData = import('simple-peer').SignalData;
type SimplePeerConstructor = typeof import('simple-peer')['default'];

export default function TimeTracking() {
  const { user } = useAuthStore();
  const [selectedTaskId, setSelectedTaskId] = useState<number | undefined>(undefined);
  const selectedTaskIdRef = useRef(selectedTaskId);
  useEffect(() => { selectedTaskIdRef.current = selectedTaskId; }, [selectedTaskId]);

  const [note, setNote] = useState('');
  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  const [isTracking, setIsTracking] = useState(false);
  const isTrackingRef = useRef(isTracking);
  useEffect(() => { isTrackingRef.current = isTracking; }, [isTracking]);

  const [startAt, setStartAt] = useState<Date | null>(null);
  const [activeTimeLogId, setActiveTimeLogId] = useState<number | undefined>(undefined);
  const activeTimeLogIdRef = useRef(activeTimeLogId);
  useEffect(() => { activeTimeLogIdRef.current = activeTimeLogId; }, [activeTimeLogId]);

  const [elapsed, setElapsed] = useState<number>(0); // seconds
  const tickIntervalRef = useRef<number | null>(null);
  const screenshotIntervalRef = useRef<number | null>(null);
  const fixedScreenshotIntervalRef = useRef<number | null>(null);
  const liveModeIntervalRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const visualCheckIntervalRef = useRef<number | null>(null);
  const previousFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const randomShotTimesRef = useRef<Date[]>([]);
  const fixedShotNextTimeRef = useRef<Date | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [hasStream, setHasStream] = useState<boolean>(!!((window as unknown as { __ttStream?: MediaStream | null }).__ttStream));
  const peerRef = useRef<SimplePeerInstance | null>(null);
  const lastOfferSdpRef = useRef<string | null>(null);
  const lastAnswerSdpRef = useRef<string | null>(null);
  const lastActivityRef = useRef<Date>(new Date());
  
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
  const lastCapturedMinuteRef = useRef<string | null>(localStorage.getItem('tt-last-captured-minute'));
  const trackerKey = 'tt-tracker';
  const captureScreenshotRef = useRef<() => Promise<void>>(async () => {});
  const mountedRef = useRef<boolean>(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    try {
      const g = (window as unknown as { __ttStream?: MediaStream | null }).__ttStream || null;
      const t = g ? g.getVideoTracks()[0] : undefined;
      const isLive = !!(g && t && t.readyState === 'live');
      setHasStream(isLive);
      if (!isLive) {
        try { (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = null; } catch { void 0; }
      }
    } catch { void 0; }
  }, []);
  const getMinuteKey = (date: Date) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().substring(0, 16);
  };

  const activityDataRef = useRef<{
    [minuteKey: string]: {
      time: string;
      keyboard_clicks: number;
      mouse_clicks: number;
      mouse_scrolls: number;
      mouse_movements: number;
      total_activity: number;
      timestamp: string;
    }
  }>({});

  useEffect(() => {
    let isElectron = false;
    let cleanupElectron: (() => void) | undefined;

    // Try to setup Electron IPC listener
    try {
      const w = window as unknown as {
        require?: (name: 'electron') => {
          ipcRenderer: {
            on: (channel: string, listener: (...args: unknown[]) => void) => void;
            removeListener: (channel: string, listener: (...args: unknown[]) => void) => void;
            send: (channel: string, ...args: unknown[]) => void;
          };
        };
      };
      if (w.require) {
         const { ipcRenderer } = w.require('electron');
         isElectron = true;
         
         const handleActivityUpdate = (
           _e: unknown,
           counts: { keyboard: number; mouseClicks: number; mouseScrolls: number; mouseMovements: number }
         ) => {
             if (!isTrackingRef.current) return;
             const now = new Date();
             lastActivityRef.current = now;
             const minuteKey = getMinuteKey(now);
             
             if (!activityDataRef.current[minuteKey]) {
                activityDataRef.current[minuteKey] = {
                  time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
                  keyboard_clicks: 0,
                  mouse_clicks: 0,
                  mouse_scrolls: 0,
                  mouse_movements: 0,
                  total_activity: 0,
                  timestamp: now.toISOString(),
                };
             }
             
             const entry = activityDataRef.current[minuteKey];
             entry.keyboard_clicks += counts.keyboard;
             entry.mouse_clicks += counts.mouseClicks;
             entry.mouse_scrolls += counts.mouseScrolls;
             entry.mouse_movements += counts.mouseMovements;
             entry.total_activity += (counts.keyboard + counts.mouseClicks + counts.mouseScrolls + counts.mouseMovements);
        };
        
        ipcRenderer.on('activity-update', handleActivityUpdate);

        const handleAppClose = async () => {
             if (isTrackingRef.current) {
                 await stopTrackingRef.current();
             }
             ipcRenderer.send('app-closed-confirmed');
        };
        ipcRenderer.on('app-close', handleAppClose);
        
        cleanupElectron = () => {
          ipcRenderer.removeListener('activity-update', handleActivityUpdate);
          ipcRenderer.removeListener('app-close', handleAppClose);
        };
      }
    } catch {
      void 0;
    }

    if (isElectron) {
      return () => {
        if (cleanupElectron) cleanupElectron();
      };
    }

    // Fallback: Web browser listeners
    const handleActivity = (e: MouseEvent | KeyboardEvent | Event) => {
      const now = new Date();
      lastActivityRef.current = now;
      if (!isTrackingRef.current) return;
      
      const minuteKey = getMinuteKey(now);

      
      if (!activityDataRef.current[minuteKey]) {
        activityDataRef.current[minuteKey] = {
          time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          keyboard_clicks: 0,
          mouse_clicks: 0,
          mouse_scrolls: 0,
          mouse_movements: 0,
          total_activity: 0,
          timestamp: now.toISOString(),
        };
      }
      
      const entry = activityDataRef.current[minuteKey];
      if (e.type === 'keydown') {
        entry.keyboard_clicks++;
        entry.total_activity++;
      } else if (e.type === 'click' || e.type === 'mousedown') {
        entry.mouse_clicks++;
        entry.total_activity++;
      } else if (e.type === 'wheel') {
        const w = e as WheelEvent;
        if (Math.abs(w.deltaY) > 0 || Math.abs(w.deltaX) > 0) {
          entry.mouse_scrolls++;
          entry.total_activity++;
        }
      } else if (e.type === 'scroll') {
        entry.mouse_scrolls++;
        entry.total_activity++;
      } else if (e.type === 'mousemove') {
        entry.mouse_movements++;
        // We might want to limit mouse movement counting to avoid flooding, but for now counting every event
        entry.total_activity++;
      }
    };
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('wheel', handleActivity);
    window.addEventListener('scroll', handleActivity);
    document.addEventListener('wheel', handleActivity, { passive: true });
    document.addEventListener('touchmove', handleActivity, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      document.removeEventListener('wheel', handleActivity);
      document.removeEventListener('touchmove', handleActivity);
      if (cleanupElectron) cleanupElectron();
    };
  }, []); // Remove isTracking dependency, use ref instead

  const { data: tasks } = useQuery({
    queryKey: ['tasks', 'for-time-tracking', user?.id],
    queryFn: () => user?.id ? tasksAPI.getTasks({ assigned_to: user.id, page: 1 }) : Promise.resolve({ data: [], current_page: 1, last_page: 1 }),
  });

  const { data: projects } = useQuery({
    queryKey: ['projects', 'for-time-tracking'],
    queryFn: () => projectsAPI.getProjects({ page: 1 }),
  });

  const taskOptions = useMemo(() => (tasks?.data ?? []), [tasks]);
  const getProjectId = (taskId?: number) => taskOptions.find((t) => t.id === taskId)?.project_id;

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
    if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
    if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
    scheduleRandomScreenshots();
    {
      const now2 = new Date();
      const m = now2.getMinutes();
      const endMin = Math.floor(m / 10) * 10 + 9;
      const target = new Date(now2);
      if (m > endMin || (m === endMin && now2.getSeconds() >= 59)) {
        target.setMinutes(endMin + 10);
      } else {
        target.setMinutes(endMin);
      }
      target.setSeconds(59);
      target.setMilliseconds(0);
      fixedShotNextTimeRef.current = target;
    }
    screenshotIntervalRef.current = window.setInterval(() => {
      scheduleRandomScreenshots();
    }, 10 * 60 * 1000);
  };

  const startVisualActivityCheck = async () => {
    if (visualCheckIntervalRef.current) window.clearInterval(visualCheckIntervalRef.current);
    
    const stream = screenStreamRef.current;
    if (!stream) return;

    // Create invisible video element to play stream
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play().catch(() => {});

    const canvas = document.createElement('canvas');
    // Low resolution is enough for activity detection
    canvas.width = 64; 
    canvas.height = 36;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    visualCheckIntervalRef.current = window.setInterval(() => {
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
                          Math.abs(frameData[i+1] - prev[i+1]) + 
                          Math.abs(frameData[i+2] - prev[i+2]);
          }
          
          // Heuristic: If significant change, count as activity
          // Lowered thresholds for 64x36 resolution
          if (diffScore > 2000) {
             const now = new Date();
             lastActivityRef.current = now;
             const minuteKey = getMinuteKey(now);
             
             if (!activityDataRef.current[minuteKey]) {
                activityDataRef.current[minuteKey] = {
                  time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
                  keyboard_clicks: 0,
                  mouse_clicks: 0,
                  mouse_scrolls: 0,
                  mouse_movements: 0,
                  total_activity: 0,
                  timestamp: now.toISOString(),
                };
             }
             
             // Base activity is always a movement
             activityDataRef.current[minuteKey].mouse_movements += 1;
             activityDataRef.current[minuteKey].total_activity += 1;

             // Heuristic for clicks and keys based on intensity of change
             // A click often causes a localized change (diffScore > 10k)
             // A scroll or window switch causes large change (diffScore > 20k)
             
             if (diffScore > 10000) {
                 activityDataRef.current[minuteKey].mouse_clicks += 1;
                 activityDataRef.current[minuteKey].total_activity += 1;
             }

             if (diffScore > 20000) {
                 // Assume large change might involve keyboard (typing/enter) or scroll
                 activityDataRef.current[minuteKey].keyboard_clicks += 1;
                 activityDataRef.current[minuteKey].total_activity += 1;
             }
          }
        }
        
        previousFrameDataRef.current = frameData;
      } catch {
        void 0;
      }
    }, 1000); // Check every second
  };

  const requestScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setHasStream(true);
      screenshotMissingWarnedRef.current = false;

      // If we have an active peer connection, we should reset it so it picks up the new stream
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch { void 0; }
        peerRef.current = null;
        // The next pollLiveStatus tick will recreate the peer with the new stream
      }
      // Persist stream globally to survive route changes
      (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = stream;
      // If user stops sharing manually, clear global reference
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          try { (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = null; } catch { void 0; }
          try { peerRef.current?.destroy(); peerRef.current = null; } catch { void 0; }
          setHasStream(false);
          if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
          if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
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
    // Check if we are still tracking
    if (!isTrackingRef.current) {
       // console.log('Skipping screenshot: Not tracking');
       return;
    }

    const projectId = getProjectId(selectedTaskIdRef.current);
    if (!projectId) {
      return;
    }
    
    let stream = screenStreamRef.current;
    if (!stream) {
      const g = (window as unknown as { __ttStream?: MediaStream | null }).__ttStream || null;
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
      try { (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = null; } catch { void 0; }
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
    try {
      // console.log('Attempting to capture screenshot...');
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
        // console.log('Screenshot captured successfully, uploading...');

        // Determine the "Logical Capture Time" (target :59)
        // If we are executing early in a minute (e.g. 10:01:02), we likely missed the exact 10:00:59 mark
        // so we attribute this to the previous minute's :59.
        const now = new Date();
        const captureTargetTime = new Date(now);
        
        // If we are in the first 30 seconds, assume we belong to previous minute
        if (now.getSeconds() < 30) {
           captureTargetTime.setMinutes(now.getMinutes() - 1);
        }
        captureTargetTime.setSeconds(59);
        captureTargetTime.setMilliseconds(0);

        // Fill gaps between last capture and target time
        const start = lastCaptureTimeRef.current;
        let loopTime = new Date(start);
        loopTime.setSeconds(0);
        loopTime.setMilliseconds(0);
        
        // Cap at 24 hours
        if (captureTargetTime.getTime() - loopTime.getTime() > 24 * 60 * 60 * 1000) {
             loopTime = new Date(captureTargetTime.getTime() - 24 * 60 * 60 * 1000);
        }

        const endTime = new Date(captureTargetTime);
        
        while (loopTime <= endTime) {
           const key = getMinuteKey(loopTime);
           if (!activityDataRef.current[key]) {
             activityDataRef.current[key] = {
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
        lastCaptureTimeRef.current = captureTargetTime;

        const file = new File([blob], `screenshot_${Date.now()}.webp`, { type: 'image/webp' });

        // Filter activity data: Only send minutes <= captureTargetTime
        // Keep future minutes (e.g. if capture delayed into next minute) for the next screenshot
        const allKeys = Object.keys(activityDataRef.current);
        
        const breakdown: ActivityMinute[] = [];
        const remainingActivity: typeof activityDataRef.current = {};

        allKeys.forEach(key => {
            // key is YYYY-MM-DDTHH:mm
            // We can treat it as a date to compare
            const keyDate = new Date(key);
            // Add 59 seconds to keyDate to compare with captureTargetTime
            // If key is 10:00, it covers 10:00:00 to 10:00:59.
            // If captureTargetTime is 10:00:59, we include 10:00.
            // If captureTargetTime is 10:00:59, we exclude 10:01.
            
            // To be safe, compare minute vs minute
            const keyTime = keyDate.getTime();
            // captureTargetTime (e.g. 10:00:59)
            // We want to include everything UP TO the minute of captureTargetTime
            const targetMinuteTime = new Date(captureTargetTime);
            targetMinuteTime.setSeconds(0);
            targetMinuteTime.setMilliseconds(0);
            
            if (keyTime <= targetMinuteTime.getTime()) {
                breakdown.push(activityDataRef.current[key]);
            } else {
                remainingActivity[key] = activityDataRef.current[key];
            }
        });

        breakdown.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Update ref to keep only remaining future activity
        activityDataRef.current = remainingActivity;
        
        // Format capturedAt
        const localCapturedAt = toLocalISOString(captureTargetTime);
        const currentMinute = localCapturedAt.substring(0, 16);

        if (lastCapturedMinuteRef.current === currentMinute) {
          //  console.log(`Skipping screenshot: Already captured for minute ${currentMinute}`);
           // If we skip, we should probably put the data back? 
           // Or just discard it as "already sent"? 
           // If we skip, it means we already sent this minute. 
           // So the data we extracted for this minute is likely duplicate or negligible.
           // Safe to discard.
           return;
        }

        await uploadShot.mutateAsync({ 
          projectId, 
          file, 
          capturedAt: localCapturedAt,
          minuteBreakdown: breakdown,
          timeLogId: activeTimeLogIdRef.current
        });
        
        lastCapturedMinuteRef.current = currentMinute;
        localStorage.setItem('tt-last-captured-minute', currentMinute);
        // console.log('Screenshot uploaded successfully');
      } else {
        // console.error('Failed to create blob from screenshot');
      }
    } catch (e) {
      void e;
    }
  };
  
  useEffect(() => {
    captureScreenshotRef.current = captureScreenshot;
  }, [captureScreenshot]);

  const runTick = useCallback(() => {
    if (mountedRef.current) setElapsed((e) => e + 1);
    
    const now = new Date();
    const remainingTimes: Date[] = [];
    
    randomShotTimesRef.current.forEach(time => {
      if (now.getTime() >= time.getTime()) {
        // console.log('Executing scheduled screenshot:', time.toLocaleTimeString());
        captureScreenshotRef.current();
      } else {
        remainingTimes.push(time);
      }
    });
    randomShotTimesRef.current = remainingTimes;
    
    if (fixedShotNextTimeRef.current && now.getTime() >= fixedShotNextTimeRef.current.getTime()) {
      captureScreenshotRef.current();
      const d = new Date(fixedShotNextTimeRef.current);
      d.setMinutes(d.getMinutes() + 10);
      fixedShotNextTimeRef.current = d;
    }
  }, []);

  const scheduleRandomScreenshots = () => {
    // Generate 3 random shots for the next 10 minutes, excluding the fixed :59 minute
    const SHOT_COUNT = 3;
    const WINDOW_MINUTES = 10;
    const now = new Date();
    const fixedNext = fixedShotNextTimeRef.current;
    const newTimes: Date[] = [];
    const usedOffsets = new Set<number>();
    while (newTimes.length < SHOT_COUNT) {
      const offset = Math.floor(Math.random() * WINDOW_MINUTES);
      if (usedOffsets.has(offset)) continue;
      const target = new Date(now);
      target.setMinutes(now.getMinutes() + offset);
      target.setSeconds(59);
      target.setMilliseconds(0);
      if (target.getTime() <= now.getTime()) continue;
      // Exclude the fixed :59 minute of the 10-min block
      if (fixedNext && getMinuteKey(target) === getMinuteKey(fixedNext)) {
        usedOffsets.add(offset);
        continue;
      }
      newTimes.push(target);
      usedOffsets.add(offset);
    }
    randomShotTimesRef.current = newTimes;
    // console.log('Scheduled screenshots at:', newTimes.map(d => d.toLocaleTimeString()));
  };

  const stopMediaTracks = () => {
    if (visualCheckIntervalRef.current) window.clearInterval(visualCheckIntervalRef.current);
    
    // Check both ref and global to ensure we really stop the stream
    const stream =
      screenStreamRef.current ||
      (window as unknown as { __ttStream?: MediaStream | null }).__ttStream ||
      null;
    if (stream) {
      try {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch {
      void 0;
    }
    }
    
    screenStreamRef.current = null;
    setHasStream(false);
    try { (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = null; } catch { void 0; }
    previousFrameDataRef.current = null;
  };

  const startHeartbeat = (logId: number, startTime: Date) => {
    if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = window.setInterval(() => {
      const now = new Date();
      const durationMinutes = Math.round((now.getTime() - startTime.getTime()) / 1000 / 60);
      
      // Update local storage with last heartbeat time
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

      updateTimeLog.mutate({
        id: logId,
        payload: {
          duration: durationMinutes,
          description: noteRef.current,
        },
      });
    }, 60 * 1000);
  };

  useEffect(() => {
    // Set a flag in sessionStorage to distinguish between a reload and a fresh start (app restart)
    const isReload = sessionStorage.getItem('is_reloaded');
    sessionStorage.setItem('is_reloaded', 'true');

    try {
      const raw = localStorage.getItem(trackerKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { isTracking: boolean; startAt?: string; taskId?: number; projectId?: number; note?: string; timeLogId?: number; lastHeartbeat?: string };
        
        if (parsed.isTracking && parsed.startAt) {
          // If this is a FRESH START (not a reload) and tracking was left on, 
          // we must assume the app was closed/crashed. We should STOP the previous session.
          // The user explicitly requested: "jb employee ne .exe file close kr di... auto stop ho jaye"
          if (!isReload) {
             const lastHeartbeat = parsed.lastHeartbeat ? new Date(parsed.lastHeartbeat) : new Date(parsed.startAt);
             
             // Calculate duration until the LAST HEARTBEAT (when app was last alive)
             const start = new Date(parsed.startAt);
             const durationMinutes = Math.round((lastHeartbeat.getTime() - start.getTime()) / 1000 / 60);
             
            //  toast.info('Previous tracking session was closed unexpectedly. Tracking has been stopped.');

             // Close the log on server
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
             
             // Clear storage
             localStorage.removeItem(trackerKey);
             
             // Reset state
             setIsTracking(false);
             isTrackingRef.current = false;
             setStartAt(null);
             setActiveTimeLogId(undefined);
             setElapsed(0);
             return; // Do not resume
          }

          // If it IS a reload, or we decided not to stop, then resume logic:
          const now = new Date();
          const lastHeartbeat = parsed.lastHeartbeat ? new Date(parsed.lastHeartbeat) : new Date(parsed.startAt);
          const timeSinceLastHeartbeat = now.getTime() - lastHeartbeat.getTime();

          // Even if it is a reload, if the gap is significant (> 60s), treat as crash/sleep and stop previous.
          // But since sessionStorage usually clears on close, isReload=true implies the browser/process stayed open.
          // We'll trust isReload for now, but maybe keep the crash check as a fallback if needed.
          // Actually, if the computer slept for 10 hours with app open, and then woke up, 
          // isReload might be true (if session persisted), but time gap is huge.
          // Let's keep the crash check as a secondary safety for "Sleep Mode" issues.
          if (timeSinceLastHeartbeat > 60 * 1000) {
            toast.error('Tracking stopped due to power/network cut.');
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
            localStorage.removeItem(trackerKey);
            return;
          }

          // Resume normally
          setIsTracking(true);
          isTrackingRef.current = true;
          const startDate = new Date(parsed.startAt);
          setStartAt(startDate);
          setElapsed(Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000)));
          const tId = parsed.taskId ? Number(parsed.taskId) : undefined;
          setSelectedTaskId(tId);
          selectedTaskIdRef.current = tId;
          setNote(parsed.note ?? '');
          noteRef.current = parsed.note ?? '';
          if (parsed.timeLogId) {
            setActiveTimeLogId(parsed.timeLogId);
            startHeartbeat(parsed.timeLogId, startDate);
          }
          // Ensure screen stream is active after navigation
          (async () => {
            try {
              const cur =
                screenStreamRef.current ||
                (window as unknown as { __ttStream?: MediaStream | null }).__ttStream ||
                null;
              const track = cur ? cur.getVideoTracks()[0] : undefined;
              if (!cur || !track || track.readyState === 'ended') {
                // If global exists and track live, reattach without prompt
                const g = (window as unknown as { __ttStream?: MediaStream | null }).__ttStream;
                const gTrack = g ? g.getVideoTracks()[0] : undefined;
                if (g && gTrack && gTrack.readyState === 'live') {
                  screenStreamRef.current = g;
                  startVisualActivityCheck();
                  setHasStream(true);
                } else {
                  await requestScreenCapture();
                }
              }
            } catch { void 0; }
          })();
          if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = window.setInterval(runTick, 1000);
          
          if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
          if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);

          // Initial fixed shot on resume? Maybe not to avoid duplicates if just reloaded.
          // But to be safe and consistent with startTracking:
          captureScreenshot();
          scheduleRandomScreenshots();
          {
            const now2 = new Date();
            const m = now2.getMinutes();
            const endMin = Math.floor(m / 10) * 10 + 9;
            const target = new Date(now2);
            if (m > endMin || (m === endMin && now2.getSeconds() >= 59)) {
              target.setMinutes(endMin + 10);
            } else {
              target.setMinutes(endMin);
            }
            target.setSeconds(59);
            target.setMilliseconds(0);
            fixedShotNextTimeRef.current = target;
          }
          
          // Interval for both fixed and random schedule
          screenshotIntervalRef.current = window.setInterval(() => {
            scheduleRandomScreenshots(); // Schedule next batch of randoms
          }, 10 * 60 * 1000);

        }
      }
    } catch { void 0; }
    
    // Auto stop when the browser goes offline (power/network cut)
    const handleOffline = () => {
      if (isTrackingRef.current) {
        toast.error('Offline detected. Tracking stopped automatically.');
        stopTrackingRef.current();
      }
    };
    window.addEventListener('offline', handleOffline);
    return () => {
      mountedRef.current = false;
      if (!isTrackingRef.current) {
        if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
        if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
        if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
        if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
        randomShotTimesRef.current = [];
        stopMediaTracks();
      }
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    
    const pollLiveStatus = async () => {
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
                    const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
                    if (turnUrl && turnUser && turnPass) {
                      servers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
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
                        void 0;
                    });

                    p.on('error', (err: unknown) => {
                        void err;
                    });

                    p.on('close', () => {
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

           if (!liveModeIntervalRef.current) {
              if (isTracking) {
                if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
                if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
                randomShotTimesRef.current = [];
              }
              liveModeIntervalRef.current = window.setInterval(() => {}, 3000);
            }
         } else {
            if (liveRequestActiveRef.current) {
               liveRequestActiveRef.current = false;
               livePromptAckRef.current = false;
               setLivePromptOpen(false);
            }
            if (liveModeIntervalRef.current) {
               window.clearInterval(liveModeIntervalRef.current);
               liveModeIntervalRef.current = null;
               if (peerRef.current) {
                   peerRef.current.destroy();
                   peerRef.current = null;
               }

               if (isTracking) {
                 captureScreenshot();
                 scheduleRandomScreenshots();
                 screenshotIntervalRef.current = window.setInterval(() => {
                   captureScreenshot();
                   scheduleRandomScreenshots();
                 }, 10 * 60 * 1000);
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
    if (!selectedTaskId || !note) {
      toast.error('Please select a task and enter a note');
      return;
    }
    const project_id = getProjectId(selectedTaskId);
    if (!project_id) {
      toast.error('Selected task has no project');
      return;
    }
    const now = new Date();
    setStartAt(now);
    setIsTracking(true);
    isTrackingRef.current = true;
    lastCaptureTimeRef.current = now;
    setElapsed(0);
    
    try {
      // Create initial time log
      const res = await createTimeLog.mutateAsync({
        project_id,
        task_id: Number(selectedTaskId),
        start_time: toLocalISOString(now),
        end_time: undefined,
        desktop_app_id: 'web',
        description: note,
      });
      const logId = res.id;
      // Use the start_time from the server response to ensure sync
      // This handles cases where the server returns an existing running log
      const serverStart = new Date(res.start_time);

      setActiveTimeLogId(logId);
      setStartAt(serverStart);
      
      localStorage.setItem(trackerKey, JSON.stringify({ 
        isTracking: true, 
        startAt: serverStart.toISOString(), 
        projectId: project_id, 
        taskId: Number(selectedTaskId), 
        note,
        timeLogId: logId 
      }));

      startHeartbeat(logId, serverStart);
    } catch { 
      toast.error('Failed to start tracking on server');
      setIsTracking(false);
      return;
    }

    await requestScreenCapture();
    if (liveRequestActiveRef.current && !screenStreamRef.current) {
      setLivePromptOpen(true);
    }
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = window.setInterval(runTick, 1000);
    
    if (screenStreamRef.current) {
      startShotSchedule();
    } else {
      // toast.info('Screen sharing stopped. Click “Resume Screenshots” to continue.');
    }
    
    toast.success('Tracking started');
  };

  const stopTracking = async () => {
    // Capture final screenshot and activity data before stopping
    if (isTrackingRef.current) {
      try {
        await captureScreenshot();
      } catch {
        void 0;
      }
    }

    // 0. IMMEDIATE CLEANUP of storage to prevent auto-start on reload
    try { localStorage.removeItem(trackerKey); } catch { void 0; }

    // 1. Clear intervals and timeouts FIRST to prevent new screenshots/heartbeats
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
    if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
    if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
    randomShotTimesRef.current = [];
    fixedShotNextTimeRef.current = null;
    
    // 2. Stop media tracks
    try {
      stopMediaTracks();
    } catch (e) {
      void e;
    }

    // 3. Update state
    setIsTracking(false);
    isTrackingRef.current = false;
    const end = new Date();
    
    // 5. Send final update to server
    if (startAt && activeTimeLogId) {
      const durationMinutes = Math.round((end.getTime() - startAt.getTime()) / 1000 / 60);
      try {
        await updateTimeLog.mutateAsync({
          id: activeTimeLogId,
          payload: {
            end_time: toLocalISOString(end),
            duration: durationMinutes,
            description: note,
          }
        });
        toast.success('Tracking stopped and saved');
      } catch {
        toast.error('Failed to save time log');
      }
    } else if (startAt && selectedTaskId) {
      // Fallback for sessions without activeTimeLogId (legacy or error)
      const project_id = getProjectId(selectedTaskId);
      if (project_id) {
        const durationMinutes = Math.round((end.getTime() - startAt.getTime()) / 1000 / 60);
        try {
          await createTimeLog.mutateAsync({
            project_id,
            task_id: selectedTaskId,
            start_time: toLocalISOString(startAt),
            end_time: toLocalISOString(end),
            duration: durationMinutes,
            description: note,
            desktop_app_id: 'web',
          });
          toast.success('Tracking stopped and saved');
        } catch {
          toast.error('Failed to save time log');
        }
      }
    }

    setStartAt(null);
    setActiveTimeLogId(undefined);
    setElapsed(0);
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
        <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
        <div className="flex gap-2">
          {!isTracking ? (
            <button onClick={startTracking} className="px-4 py-2 rounded bg-indigo-600 text-white">Start</button>
          ) : (
            <button onClick={stopTracking} className="px-4 py-2 rounded bg-red-600 text-white">Stop</button>
          )}
          {isTracking && !hasStream && (
            <button onClick={requestScreenCapture} className="px-4 py-2 rounded bg-gray-200 text-gray-800">Resume Screenshots</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Task</label>
            <select
              value={selectedTaskId ?? ''}
              onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : undefined)}
              className="mt-1 block w-full border rounded px-3 py-2"
              disabled={isTracking}
            >
              <option value="">Select task</option>
              {(taskOptions ?? []).map((t) => (
                <option key={t.id} value={t.id}>{t.title} {projects?.data?.find((p) => p.id === t.project_id)?.name ? `- ${projects?.data?.find((p) => p.id === t.project_id)?.name}` : ''}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What are you working on?"
              className="mt-1 block w-full border rounded px-3 py-2"
              disabled={isTracking}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">Elapsed: <span className="font-semibold">{Math.floor(elapsed/3600).toString().padStart(2,'0')}:{Math.floor((elapsed%3600)/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</span></div>
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
                      try { stopMediaTracks(); } catch { void 0; }
                      setHasStream(false);
                      try { (window as unknown as { __ttStream?: MediaStream | null }).__ttStream = null; } catch { void 0; }
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
    </div>
  );
}
