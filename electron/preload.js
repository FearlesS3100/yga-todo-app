const { contextBridge, ipcRenderer } = require('electron');
const { shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  showNotification: ({ title, body, todoId }) => {
    ipcRenderer.send('notify:show', { title, body, todoId });
  },
  openExternal: (url) => shell.openExternal(url),
  downloadFile: (url, fileName) => ipcRenderer.invoke('download:file', { url, fileName }),
  onBeforeQuit: (callback) => {
    ipcRenderer.on('app:before-quit', () => callback());
  },
  onCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:close-requested', listener);
    return () => ipcRenderer.removeListener('app:close-requested', listener);
  },
  confirmQuit: () => {
    ipcRenderer.send('app:confirm-quit');
  },
  setNeedsCloseReason: (value) => {
    ipcRenderer.send('app:set-needs-close-reason', Boolean(value));
  },
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getHostname: () => ipcRenderer.invoke('app:get-hostname'),
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  onNotificationClick: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('notification:clicked', listener);
    return () => ipcRenderer.removeListener('notification:clicked', listener);
  },
  getIntroSettings: () => ipcRenderer.invoke('intro:get-settings'),
  getIntroVideoUrl: () => ipcRenderer.invoke('intro:get-video-url'),
  getIntroVideoDataUrl: () => ipcRenderer.invoke('intro:get-video-data-url'),
  onIntroSettingsChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('intro:settings-changed', listener);
    return () => ipcRenderer.removeListener('intro:settings-changed', listener);
  },
});
