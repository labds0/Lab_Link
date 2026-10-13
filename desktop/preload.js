const { contextBridge, ipcRenderer } = require('electron');

const config = ipcRenderer.sendSync('config');

// رسالة الخطأ بتوصل نضيفة من غير بادئة Electron
const call = async (ch, ...a) => {
  try { return await ipcRenderer.invoke(ch, ...a); }
  catch (e) { throw new Error(String((e && e.message) || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')); }
};
const on = (ch) => (fn) => ipcRenderer.on(ch, (_e, data) => fn(data));

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
  // فتح رابط واتساب / SMS في البرنامج الافتراضي (مسموح بيهم بس)
  openExternal: (url) => call('open:external', url),
  // الرفع التلقائي من فولدر: الواجهة بتتعامل بـ id بس ومش بتبعت أي مسارات
  folder: {
    get: () => call('folder:get'),
    choose: () => call('folder:choose'),
    set: (o) => call('folder:set', o),
    read: (id) => call('folder:read', id),
    done: (id) => call('folder:done', id),
    skip: (id) => call('folder:skip', id),
    onFound: on('folder:found'),
    onGone: on('folder:gone'),
    onError: on('folder:error'),
  },
});
