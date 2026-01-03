const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { uIOhook, UiohookKey } = require('uiohook-napi');

let mainWindow;
let isQuitting = false;

// Global activity tracking state
let activityCounts = {
  keyboard: 0,
  mouseClicks: 0,
  mouseScrolls: 0,
  mouseMovements: 0
};

// Initialize global hooks
uIOhook.on('keydown', () => {
  activityCounts.keyboard++;
});

uIOhook.on('mousedown', () => {
  activityCounts.mouseClicks++;
});

uIOhook.on('wheel', () => {
  activityCounts.mouseScrolls++;
});

uIOhook.on('mousemove', () => {
  activityCounts.mouseMovements++;
});

uIOhook.start();

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
      // preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../public/favicon.ico') // Assuming favicon exists
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
  // In production, load from file
  const isDev = !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle external links if needed
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      require('electron').shell.openExternal(url);
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
    }).catch(console.error);
  });

  // Send activity updates to renderer every second
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      // Only send if there is activity to report, or just send zeros?
      // Sending always ensures the frontend knows we are alive.
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
  createWindow();

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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
