const { contextBridge, ipcRenderer } = require('electron');

const ipcRendererWrapper = {
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  }
};

try {
  if (contextBridge && typeof contextBridge.exposeInMainWorld === 'function') {
    contextBridge.exposeInMainWorld('ipcRenderer', ipcRendererWrapper);
  } else {
    window.ipcRenderer = ipcRendererWrapper;
  }
} catch (e) {
  window.ipcRenderer = ipcRendererWrapper;
}
