import { useEffect } from 'react';

const getMinuteKey = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  const localDate = new Date(date.getTime() - offset);
  return localDate.toISOString().substring(0, 16);
};

export function useGlobalTrackerActivity() {
  useEffect(() => {
    let isElectron = false;
    let cleanupElectron: (() => void) | undefined;

    // Try to setup Electron IPC listener
    try {
      const w = window as any;
      const ipcRenderer = w.ipcRenderer || (w.require ? w.require('electron').ipcRenderer : null);

      if (ipcRenderer) {
        isElectron = true;
        ipcRenderer.send('log-debug', 'useGlobalTrackerActivity: Electron environment detected. Setting up listeners.');

        const handleActivityUpdate = (
          _e: unknown,
          counts: { keyboard: number; mouseClicks: number; mouseScrolls: number; mouseMovements: number }
        ) => {
          const core = w.__tt_core;
          if (!core) {
            ipcRenderer.send('log-debug', 'handleActivityUpdate: window.__tt_core is undefined');
            return;
          }
          if (!core.isTracking) {
            // Log once in a while or when counts > 0 to avoid log flooding, but counts > 0 is important
            if (counts.keyboard > 0 || counts.mouseClicks > 0 || counts.mouseScrolls > 0 || counts.mouseMovements > 0) {
              ipcRenderer.send('log-debug', `handleActivityUpdate: Received counts but tracking is inactive: ${JSON.stringify(counts)}`);
            }
            return;
          }

          const now = new Date();
          core.lastActivity = now;
          if ((counts.keyboard + counts.mouseClicks + counts.mouseScrolls + counts.mouseMovements) > 0) {
            core.lastNativeActivityAt = now.getTime();
          }
          const minuteKey = getMinuteKey(now);

          ipcRenderer.send('log-debug', `handleActivityUpdate: Received counts: ${JSON.stringify(counts)}, writing to minuteKey: ${minuteKey}`);

          if (!core.activityData[minuteKey]) {
            core.activityData[minuteKey] = {
              time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
              keyboard_clicks: 0,
              mouse_clicks: 0,
              mouse_scrolls: 0,
              mouse_movements: 0,
              total_activity: 0,
              timestamp: now.toISOString(),
            };
          }

          const entry = core.activityData[minuteKey];
          entry.keyboard_clicks += counts.keyboard;
          entry.mouse_clicks += counts.mouseClicks;
          entry.mouse_scrolls += counts.mouseScrolls;
          entry.mouse_movements += counts.mouseMovements;
          entry.total_activity += (counts.keyboard + counts.mouseClicks + counts.mouseScrolls + counts.mouseMovements);
        };

        // Local touchscreen tap, move, and scroll tracker inside Electron window
        let lastTouchPos = { x: 0, y: 0 };
        const handleLocalPointer = (e: PointerEvent) => {
          if (e.pointerType === 'touch' || e.pointerType === 'pen') {
            const core = w.__tt_core;
            if (!core || !core.isTracking) return;

            const now = new Date();
            core.lastActivity = now;
            core.lastNativeActivityAt = now.getTime();
            const minuteKey = getMinuteKey(now);

            if (!core.activityData[minuteKey]) {
              core.activityData[minuteKey] = {
                time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
                keyboard_clicks: 0,
                mouse_clicks: 0,
                mouse_scrolls: 0,
                mouse_movements: 0,
                total_activity: 0,
                timestamp: now.toISOString(),
              };
            }

            const entry = core.activityData[minuteKey];
            if (e.type === 'pointerdown') {
              entry.mouse_clicks++;
              entry.total_activity++;
              lastTouchPos = { x: e.clientX, y: e.clientY };
              ipcRenderer.send('log-debug', `handleLocalPointer: Touch click. Total clicks: ${entry.mouse_clicks}`);
            } else if (e.type === 'pointermove') {
              const dist = Math.abs(e.clientX - lastTouchPos.x) + Math.abs(e.clientY - lastTouchPos.y);
              if (dist >= 5) {
                entry.mouse_movements++;
                entry.total_activity++;
                lastTouchPos = { x: e.clientX, y: e.clientY };
              }
            }
          }
        };

        const handleLocalScroll = () => {
          const core = w.__tt_core;
          if (!core || !core.isTracking) return;

          const now = new Date();
          core.lastActivity = now;
          core.lastNativeActivityAt = now.getTime();
          const minuteKey = getMinuteKey(now);

          if (!core.activityData[minuteKey]) {
            core.activityData[minuteKey] = {
              time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
              keyboard_clicks: 0,
              mouse_clicks: 0,
              mouse_scrolls: 0,
              mouse_movements: 0,
              total_activity: 0,
              timestamp: now.toISOString(),
            };
          }

          const entry = core.activityData[minuteKey];
          entry.mouse_scrolls++;
          entry.mouse_movements++;
          entry.total_activity += 2;
        };

        ipcRenderer.on('activity-update', handleActivityUpdate);
        window.addEventListener('pointerdown', handleLocalPointer);
        window.addEventListener('pointermove', handleLocalPointer);
        window.addEventListener('scroll', handleLocalScroll, { passive: true });

        const handleAppClose = async () => {
          ipcRenderer.send('log-debug', 'handleAppClose: App close event received in renderer.');
          const core = w.__tt_core;
          if (core && core.isTracking && typeof w.__tt_stop_tracking === 'function') {
            ipcRenderer.send('log-debug', 'handleAppClose: Stopping tracking on app close...');
            await w.__tt_stop_tracking();
          }
          ipcRenderer.send('app-closed-confirmed');
        };
        ipcRenderer.on('app-close', handleAppClose);


        cleanupElectron = () => {
          ipcRenderer.removeListener('activity-update', handleActivityUpdate);
          ipcRenderer.removeListener('app-close', handleAppClose);
          window.removeEventListener('pointerdown', handleLocalPointer);
          window.removeEventListener('pointermove', handleLocalPointer);
          window.removeEventListener('scroll', handleLocalScroll);
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

    // Fallback: Web browser listeners using PointerEvents for touch/pen/mouse unified support
    let lastMousePos = { x: 0, y: 0 };
    const handleActivity = (e: PointerEvent | KeyboardEvent | Event) => {
      const core = (window as any).__tt_core;
      if (!core || !core.isTracking) return;

      const now = new Date();
      core.lastActivity = now;

      const minuteKey = getMinuteKey(now);

      if (!core.activityData[minuteKey]) {
        core.activityData[minuteKey] = {
          time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
          keyboard_clicks: 0,
          mouse_clicks: 0,
          mouse_scrolls: 0,
          mouse_movements: 0,
          total_activity: 0,
          timestamp: now.toISOString(),
        };
      }

      const entry = core.activityData[minuteKey];
      if (e.type === 'keydown') {
        entry.keyboard_clicks++;
        entry.total_activity++;
      } else if (e.type === 'click' || e.type === 'mousedown' || e.type === 'pointerdown') {
        entry.mouse_clicks++;
        entry.total_activity++;
      } else if (e.type === 'wheel') {
        const w = e as WheelEvent;
        if (Math.abs(w.deltaY) > 0 || Math.abs(w.deltaX) > 0) {
          entry.mouse_scrolls++;
          entry.mouse_movements++;
          entry.total_activity += 2;
        }
      } else if (e.type === 'scroll') {
        entry.mouse_scrolls++;
        entry.mouse_movements++;
        entry.total_activity += 2;
      } else if (e.type === 'mousemove' || e.type === 'pointermove') {
        const m = e as PointerEvent;
        const dist = Math.abs(m.clientX - lastMousePos.x) + Math.abs(m.clientY - lastMousePos.y);
        if (dist > 5) {
          lastMousePos = { x: m.clientX, y: m.clientY };
          entry.mouse_movements++;
          entry.total_activity++;
        }
      }
    };

    window.addEventListener('pointermove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('wheel', handleActivity);
    window.addEventListener('scroll', handleActivity);
    document.addEventListener('wheel', handleActivity, { passive: true });
    document.addEventListener('touchmove', handleActivity, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('wheel', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      document.removeEventListener('wheel', handleActivity);
      document.removeEventListener('touchmove', handleActivity);
      if (cleanupElectron) cleanupElectron();
    };
  }, []);
}
