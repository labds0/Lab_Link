const { contextBridge, ipcRenderer } = require('electron');

const config = ipcRenderer.sendSync('config');

contextBridge.exposeInMainWorld('desktop', {
  config,
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: (fn) => {
    for (const ev of ['available', 'none', 'progress', 'ready', 'error']) {
      ipcRenderer.on('update:' + ev, (_e, data) => fn(ev, data));
    }
  },
});
