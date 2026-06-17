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

        const handleActivityUpdate = (
          _e: unknown,
          counts: { keyboard: number; mouseClicks: number; mouseScrolls: number; mouseMovements: number }
        ) => {
          const core = w.__tt_core;
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
          entry.keyboard_clicks += counts.keyboard;
          entry.mouse_clicks += counts.mouseClicks;
          entry.mouse_scrolls += counts.mouseScrolls;
          entry.mouse_movements += counts.mouseMovements;
          entry.total_activity += (counts.keyboard + counts.mouseClicks + counts.mouseScrolls + counts.mouseMovements);
        };

        ipcRenderer.on('activity-update', handleActivityUpdate);

        const handleAppClose = async () => {
          const core = w.__tt_core;
          if (core && core.isTracking && typeof w.__tt_stop_tracking === 'function') {
            await w.__tt_stop_tracking();
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
    let lastMousePos = { x: 0, y: 0 };
    const handleActivity = (e: MouseEvent | KeyboardEvent | Event) => {
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
        const m = e as MouseEvent;
        const dist = Math.abs(m.clientX - lastMousePos.x) + Math.abs(m.clientY - lastMousePos.y);
        if (dist > 5) {
          lastMousePos = { x: m.clientX, y: m.clientY };
          entry.mouse_movements++;
          entry.total_activity++;
        }
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
  }, []);
}
