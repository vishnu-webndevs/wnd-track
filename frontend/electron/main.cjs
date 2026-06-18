const { app, BrowserWindow, screen, ipcMain, shell, session, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { uIOhook, UiohookKey } = require('uiohook-napi');

let mainWindow;
let isQuitting = false;

const logPath = path.join(__dirname, '../scratch/tracker_debug.log');

try {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `=== Tracker Debug Log started at ${new Date().toISOString()} ===\n`);
} catch (e) {
  console.error('Failed to create debug log file', e);
}

function logDebug(msg) {
  try {
    const time = new Date().toISOString().substring(11, 23);
    fs.appendFileSync(logPath, `[${time}] ${msg}\n`);
  } catch (e) { }
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.tracker.webndevs');
}

// Global activity tracking state
let activityCounts = {
  keyboard: 0,
  mouseClicks: 0,
  mouseScrolls: 0,
  mouseMovements: 0
};

const MOUSE_MOVE_MIN_INTERVAL_MS = 250;
const MOUSE_MOVE_MIN_DISTANCE = 12;
let lastMouseMoveCountedAt = 0;
let lastMousePos = null;

// Initialize global hooks
logDebug('Initializing uIOhook global hooks...');

uIOhook.on('keyup', (e) => {
  activityCounts.keyboard++;
  logDebug(`[uIOhook] keyup event. Total keyboard: ${activityCounts.keyboard}`);
});

uIOhook.on('mousedown', (e) => {
  activityCounts.mouseClicks++;
  logDebug(`[uIOhook] mousedown event. Total mouseClicks: ${activityCounts.mouseClicks}`);
});

uIOhook.on('wheel', (e) => {
  activityCounts.mouseScrolls++;
  activityCounts.mouseMovements++;
  logDebug(`[uIOhook] wheel event. Total mouseScrolls: ${activityCounts.mouseScrolls}, movements: ${activityCounts.mouseMovements}`);
});

// Global cursor movement and touchscreen click tracking is handled via polling in app.whenReady()

try {
  uIOhook.start();
  logDebug('uIOhook.start() completed.');
} catch (err) {
  logDebug(`ERROR starting uIOhook: ${err.message}\n${err.stack}`);
}


const iconPath = app.isPackaged
  ? path.join(__dirname, '../dist/tracker_logo.png')
  : path.join(__dirname, '../public/tracker_logo.png');

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Tracker Webndevs', // Set custom title
    autoHideMenuBar: true, // Hide the menu bar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple migration, though strictly less secure. Better to use preload in future.
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: iconPath
  });

  mainWindow = win;

  win.setMenuBarVisibility(false); // Explicitly hide menu bar
  win.removeMenu(); // Remove the menu entirely (Windows/Linux)

  // Handle Close Event for Graceful Shutdown
  win.on('close', (e) => {
    if (isQuitting) return;

    e.preventDefault();

    // Check if renderer is still alive
    if (!win.webContents || win.webContents.isDestroyed()) {
      isQuitting = true;
      win.close();
      return;
    }

    // Send message to renderer to stop tracking
    win.webContents.send('app-close');

    // Fallback: If renderer doesn't respond in 2 seconds (faster fallback), close anyway
    setTimeout(() => {
      isQuitting = true;
      if (!win.isDestroyed()) win.close();
    }, 2000);
  });

  // In development, load from localhost



  // In development, load from localhost
  const isDev = !app.isPackaged;

  if (isDev) {
    session.defaultSession.clearCache().finally(() => {
      win.loadURL('http://localhost:5173');
    });
    // win.webContents.openDevTools();
  } else {
    // Clear cache to always get the latest deployed changes from the server
    session.defaultSession.clearCache().finally(() => {
      win.loadURL('https://tracker.webndevs.com/#/');
    });
  }

  // Handle external links if needed
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  // Handle screen recording permissions
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    require('electron').desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Grant access to the first screen available.
      // In a real app, you might want to let the user choose, but for now we auto-select.
      // Or we can return all sources to let the default picker show UI (if implemented by Electron, which often isn't).
      // For auto-selection:
      if (sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        // No screen found
        callback({ video: null, audio: null });
      }
    }).catch(() => void 0);
  });

  // Send activity updates to renderer every second
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      // Only send if there is activity to report, or just send zeros?
      // Sending always ensures the frontend knows we are alive.
      if (activityCounts.keyboard > 0 || activityCounts.mouseClicks > 0 || activityCounts.mouseScrolls > 0 || activityCounts.mouseMovements > 0) {
        logDebug(`Sending activity-update to renderer: ${JSON.stringify(activityCounts)}`);
      }
      win.webContents.send('activity-update', activityCounts);

      // Reset counts
      activityCounts = {
        keyboard: 0,
        mouseClicks: 0,
        mouseScrolls: 0,
        mouseMovements: 0
      };
    }
  }, 1000);
}

app.whenReady().then(() => {
  logDebug('app.whenReady() resolved. Creating window and setting up listeners.');
  createWindow();

  // Start global cursor polling to detect mouse movements and touchscreen taps.
  // Bypasses native uIOhook limitations where touchscreen taps are ignored by OS low-level hooks.
  let lastCheckPos = null;
  setInterval(() => {
    try {
      const currentPos = screen.getCursorScreenPoint();
      if (lastCheckPos) {
        const dist = Math.abs(currentPos.x - lastCheckPos.x) + Math.abs(currentPos.y - lastCheckPos.y);
        if (dist >= 3) {
          activityCounts.mouseMovements++;
          if (dist >= 15) {
            activityCounts.mouseClicks++;
            logDebug(`[CursorPoll] Touch/jump click detected. Dist: ${dist}. Total clicks: ${activityCounts.mouseClicks}, movements: ${activityCounts.mouseMovements}`);
          }
        }
      }
      lastCheckPos = currentPos;
    } catch (e) {
      logDebug(`[CursorPoll] Error getting screen cursor point: ${e.message}`);
    }
  }, 100);

  // Register log-debug IPC handler
  ipcMain.on('log-debug', (event, msg) => {
    logDebug(`[Renderer] ${msg}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.on('app-closed-confirmed', () => {
    if (mainWindow) {
      isQuitting = true;
      mainWindow.close();
    }
  });

  ipcMain.on('focus-window', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.on('show-notification', (event, { title, body, data }) => {
    try {
      const notification = new Notification({
        title,
        body,
        icon: iconPath,
        silent: false
      });

      notification.on('click', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('notification-clicked', data);
        }
      });

      notification.show();
    } catch (e) {
      void e;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
