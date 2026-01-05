import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeTrackingAPI } from '../api/timeTracking';
import { tasksAPI } from '../api/tasks';
import { projectsAPI } from '../api/projects';
import { usersAPI } from '../api/users';
import { useAuthStore } from '../stores/authStore';
import { toast } from 'sonner';
import LoadingSpinner from '../components/LoadingSpinner';

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
  const randomShotTimeoutsRef = useRef<number[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const lastActivityRef = useRef<Date>(new Date());
  const lastCaptureTimeRef = useRef<Date>(new Date());
  const trackerKey = 'tt-tracker';
  
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
      if ((window as any).require) {
         const { ipcRenderer } = (window as any).require('electron');
         isElectron = true;
         
         const handleActivityUpdate = (_e: any, counts: any) => {
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
        
        cleanupElectron = () => {
          ipcRenderer.removeListener('activity-update', handleActivityUpdate);
        };
      }
    } catch (e) {
      console.warn('Not in Electron environment');
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
      } else if (e.type === 'wheel' || e.type === 'scroll') {
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
    window.addEventListener('click', handleActivity);
    window.addEventListener('wheel', handleActivity);
    window.addEventListener('scroll', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('scroll', handleActivity);
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
    mutationFn: (args: { projectId: number; file: File; capturedAt: string; minuteBreakdown?: any[]; timeLogId?: number }) =>
      timeTrackingAPI.uploadScreenshot(args.projectId, args.file, args.capturedAt, args.minuteBreakdown, args.timeLogId),
  });

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
          if (diffScore > 50000) {
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
             // A click often causes a localized change (diffScore > 100k)
             // A scroll or window switch causes large change (diffScore > 300k)
             // Typing causes rapid small-medium changes, but here we just approximate.
             
             if (diffScore > 100000) {
                 activityDataRef.current[minuteKey].mouse_clicks += 1;
                 activityDataRef.current[minuteKey].total_activity += 1;
             }

             if (diffScore > 300000) {
                 // Assume large change might involve keyboard (typing/enter) or scroll
                 activityDataRef.current[minuteKey].keyboard_clicks += 1;
                 activityDataRef.current[minuteKey].total_activity += 1;
             }
          }
        }
        
        previousFrameDataRef.current = frameData;
      } catch (e) {
        console.warn('Visual activity check failed', e);
      }
    }, 1000); // Check every second
  };

  const requestScreenCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      startVisualActivityCheck();
      return stream;
    } catch {
      toast.error('Screen capture permission denied');
      return null;
    }
  };

  const captureScreenshot = async () => {
    // Check if we are still tracking
    if (!isTrackingRef.current) {
       console.log('Skipping screenshot: Not tracking');
       return;
    }

    const projectId = getProjectId(selectedTaskIdRef.current);
    if (!projectId) {
      console.warn('Skipping screenshot: No project ID found for task', selectedTaskIdRef.current);
      return;
    }
    
    const stream = screenStreamRef.current;
    if (!stream) {
      console.warn('Skipping screenshot: No screen stream available');
      return;
    }
    
    const track = stream.getVideoTracks()[0];
    if (!track) {
      console.warn('Skipping screenshot: No video track found');
      return;
    }

    if (track.readyState === 'ended') {
      console.warn('Skipping screenshot: Video track ended');
      // Potentially stop tracking here or notify user?
      toast.error('Screen sharing stopped. Please resume to capture screenshots.');
      return;
    }

    type ImageCaptureClass = new (track: MediaStreamTrack) => { grabFrame?: () => Promise<ImageBitmap> };
    const ImageCaptureCtor = (window as unknown as { ImageCapture?: ImageCaptureClass }).ImageCapture;
    const imageCapture = ImageCaptureCtor ? new ImageCaptureCtor(track) : null;
    
    let blob: Blob | null = null;
    try {
      console.log('Attempting to capture screenshot...');
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
        console.log('Screenshot captured successfully, uploading...');

        // Fill gaps between last capture and now
        const now = new Date();
        const start = lastCaptureTimeRef.current;
        
        let loopTime = new Date(start);
        loopTime.setSeconds(0);
        loopTime.setMilliseconds(0);
        
        // Cap at 24 hours to prevent infinite loops
        if (now.getTime() - loopTime.getTime() > 24 * 60 * 60 * 1000) {
             loopTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        const endTime = new Date(now);
        
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
        lastCaptureTimeRef.current = now;

        const file = new File([blob], `screenshot_${Date.now()}.webp`, { type: 'image/webp' });
        const breakdown = Object.values(activityDataRef.current);
        breakdown.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // Reset breakdown after capture
        activityDataRef.current = {};
        
        // Format capturedAt as local time "YYYY-MM-DD HH:mm:ss" to match user expectation in DB
        const localCapturedAt = toLocalISOString(new Date());

        await uploadShot.mutateAsync({ 
          projectId, 
          file, 
          capturedAt: localCapturedAt,
          minuteBreakdown: breakdown,
          timeLogId: activeTimeLogIdRef.current
        });
        console.log('Screenshot uploaded successfully');
      } else {
        console.error('Failed to create blob from screenshot');
      }
    } catch (e) {
      console.error('Screenshot capture failed', e);
    }
  };

  const scheduleRandomScreenshots = () => {
    randomShotTimeoutsRef.current.forEach(window.clearTimeout);
    randomShotTimeoutsRef.current = [];
    const SHOT_COUNT = 3;
    const INTERVAL_MS = 10 * 60 * 1000;
    for (let i = 0; i < SHOT_COUNT; i++) {
      const delay = Math.floor(Math.random() * INTERVAL_MS);
      const timeoutId = window.setTimeout(() => {
        captureScreenshot();
      }, delay);
      randomShotTimeoutsRef.current.push(timeoutId);
    }
  };

  const stopMediaTracks = () => {
    if (visualCheckIntervalRef.current) window.clearInterval(visualCheckIntervalRef.current);
    const stream = screenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    screenStreamRef.current = null;
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
      } catch (e) { console.error(e); }

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
             const now = new Date();
             const lastHeartbeat = parsed.lastHeartbeat ? new Date(parsed.lastHeartbeat) : new Date(parsed.startAt);
             
             // Calculate duration until the LAST HEARTBEAT (when app was last alive)
             const start = new Date(parsed.startAt);
             const durationMinutes = Math.round((lastHeartbeat.getTime() - start.getTime()) / 1000 / 60);
             
             toast.info('Previous tracking session was closed unexpectedly. Tracking has been stopped.');

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

          // Even if it is a reload, if the gap is HUGE (> 5 mins), it might be a "suspend/resume" scenario.
          // But since sessionStorage usually clears on close, isReload=true implies the browser/process stayed open.
          // We'll trust isReload for now, but maybe keep the crash check as a fallback if needed.
          // Actually, if the computer slept for 10 hours with app open, and then woke up, 
          // isReload might be true (if session persisted), but time gap is huge.
          // Let's keep the crash check as a secondary safety for "Sleep Mode" issues.
          if (timeSinceLastHeartbeat > 5 * 60 * 1000) {
              // ... Same crash logic as before ...
              toast.error('Tracking stopped due to system sleep/suspension.');
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
          const tId = parsed.taskId ? Number(parsed.taskId) : undefined;
          setSelectedTaskId(tId);
          selectedTaskIdRef.current = tId;
          setNote(parsed.note ?? '');
          noteRef.current = parsed.note ?? '';
          if (parsed.timeLogId) {
            setActiveTimeLogId(parsed.timeLogId);
            startHeartbeat(parsed.timeLogId, startDate);
          }
          if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
          tickIntervalRef.current = window.setInterval(() => {
            setElapsed((e) => e + 1);
          }, 1000);
          
          if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
          if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);

          // Initial fixed shot on resume? Maybe not to avoid duplicates if just reloaded.
          // But to be safe and consistent with startTracking:
          captureScreenshot();
          scheduleRandomScreenshots();
          
          // Interval for both fixed and random schedule
          screenshotIntervalRef.current = window.setInterval(() => {
            captureScreenshot(); // Fixed shot every 10 mins
            scheduleRandomScreenshots(); // Schedule next batch of randoms
          }, 10 * 60 * 1000);

        }
      }
    } catch (e) { void e; }
    return () => {
      if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
      if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
      if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
      if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
      randomShotTimeoutsRef.current.forEach(window.clearTimeout);
      stopMediaTracks();
    };
  }, []);

  useEffect(() => {
    if (!isTracking) return;
    
    const pollLiveStatus = async () => {
       try {
         const { live_mode, offer } = await usersAPI.checkLiveStatus();
         
         if (live_mode) {
            // WebRTC Logic
             if (offer && user) {
                 // If we already have a PC, check if this is a NEW offer (re-connection)
                 // or if we are stuck. For simplicity, if we see an offer, we assume it's a new handshake request.
                 if (pcRef.current) {
                     console.log('Replacing existing WebRTC connection with new offer');
                     pcRef.current.close();
                     pcRef.current = null;
                 }

                 // toast.info('Starting Live Stream...'); // Silent start
                 
                 // Ensure we have a stream (Auto-accept/Auto-recover)
                 if (!screenStreamRef.current) {
                     await requestScreenCapture();
                 }

                 const pc = new RTCPeerConnection({
                     iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                 });
                 pcRef.current = pc;
                 
                 pc.onicecandidate = (event) => {
                     if (event.candidate) {
                         usersAPI.signal(user.id, { type: 'candidate', candidate: event.candidate });
                     }
                 };
                 
                 // Add tracks
                 if (screenStreamRef.current) {
                     screenStreamRef.current.getTracks().forEach(track => {
                         pc.addTrack(track, screenStreamRef.current!);
                     });
                 }
                 
                 await pc.setRemoteDescription(new RTCSessionDescription(offer));
                 const answer = await pc.createAnswer();
                 await pc.setLocalDescription(answer);
                 
                 await usersAPI.signal(user.id, { type: 'answer', sdp: answer.sdp });
            }
            
            // Poll for candidates
            if (pcRef.current && user) {
                 const candidates = await usersAPI.getSignal(user.id, 'candidate');
                 if (candidates && Array.isArray(candidates)) {
                     for (const cand of candidates) {
                         if (cand.candidate) { 
                            try {
                                await pcRef.current.addIceCandidate(cand.candidate);
                            } catch (e) { console.warn(e); }
                         }
                     }
                 }
            }

            if (!liveModeIntervalRef.current) {
               // toast.info('Live View Requested by Admin'); // Silent mode
               
               // Clear normal intervals
               if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
               if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
               randomShotTimeoutsRef.current.forEach(window.clearTimeout);
               randomShotTimeoutsRef.current = [];
               
               // Start fast interval (3 seconds) for keep-alive/polling
               liveModeIntervalRef.current = window.setInterval(() => {
                  // captureScreenshot(); // Disabled for WebRTC stream
               }, 3000);
            }
         } else {
            if (liveModeIntervalRef.current) {
               window.clearInterval(liveModeIntervalRef.current);
               liveModeIntervalRef.current = null;
               // toast.info('Live View Ended'); // Silent mode
               
               if (pcRef.current) {
                   pcRef.current.close();
                   pcRef.current = null;
               }

               // Restore normal interval
               captureScreenshot();
               scheduleRandomScreenshots();
               screenshotIntervalRef.current = window.setInterval(() => {
                 captureScreenshot();
                 scheduleRandomScreenshots();
               }, 10 * 60 * 1000);
            }
         }
       } catch (e) {
         // silent fail
       }
    };

    const poller = window.setInterval(pollLiveStatus, 5000); 
    return () => {
       window.clearInterval(poller);
       if (liveModeIntervalRef.current) window.clearInterval(liveModeIntervalRef.current);
    };
  }, [isTracking]);

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
    } catch (e) { 
      console.error(e);
      toast.error('Failed to start tracking on server');
      setIsTracking(false);
      return;
    }

    await requestScreenCapture();
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = window.setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    
    if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
    if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
    
    // Initial schedule
    scheduleRandomScreenshots();
    
    // Repeat every 10 minutes
    screenshotIntervalRef.current = window.setInterval(() => {
      scheduleRandomScreenshots();
    }, 10 * 60 * 1000);

    // Fixed 1 per minute
    fixedScreenshotIntervalRef.current = window.setInterval(() => {
       captureScreenshot();
    }, 60 * 1000);
    
    toast.success('Tracking started');
  };

  const stopTracking = async () => {
    // Capture final screenshot and activity data before stopping
    if (isTrackingRef.current) {
      try {
        await captureScreenshot();
      } catch (e) {
        console.error('Failed to capture final screenshot', e);
      }
    }

    // 0. IMMEDIATE CLEANUP of storage to prevent auto-start on reload
    try { localStorage.removeItem(trackerKey); } catch (e) { console.error('Failed to remove tracker key', e); }

    // 1. Clear intervals and timeouts FIRST to prevent new screenshots/heartbeats
    if (tickIntervalRef.current) window.clearInterval(tickIntervalRef.current);
    if (screenshotIntervalRef.current) window.clearInterval(screenshotIntervalRef.current);
    if (fixedScreenshotIntervalRef.current) window.clearInterval(fixedScreenshotIntervalRef.current);
    if (heartbeatIntervalRef.current) window.clearInterval(heartbeatIntervalRef.current);
    randomShotTimeoutsRef.current.forEach(window.clearTimeout);
    randomShotTimeoutsRef.current = [];
    
    // 2. Stop media tracks
    try {
      stopMediaTracks();
    } catch (e) {
      console.error('Failed to stop media tracks', e);
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
          {isTracking && !screenStreamRef.current && (
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
    </div>
  );
}
