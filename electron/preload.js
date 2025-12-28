
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  saveAudio: (id, blob) => ipcRenderer.invoke('save-audio', id, blob),
  getAudioUrl: (id) => ipcRenderer.invoke('get-audio-url', id),
  deleteAudio: (id) => ipcRenderer.invoke('delete-audio', id),
  getPlatform: () => process.platform
});
