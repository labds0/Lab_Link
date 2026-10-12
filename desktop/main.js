const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const config = require('./app-config.json');

const { parseHardware, serialFromParts, resolveSerial, readWindowsHardware } = require('./serial');

// سيريال الجهاز مربوط بالهاردوير (اللوحة الأم + هارد النظام)، مش بالويندوز ولا الإنترنت.
let SERIAL = '';
function computeSerial() {
  const userData = app.getPath('userData');
  const cacheFile = path.join(userData, 'serial-cache.json');
  let fresh = null;
  try {
    if (process.platform === 'win32') {
      fresh = serialFromParts(readWindowsHardware(execFileSync));
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      const m = out.match(/"IOPlatformUUID" = "([^"]+)"/);
      if (m) fresh = serialFromParts(parseHardware({ u: m[1] }));
    } else {
      fresh = serialFromParts(parseHardware({ u: fs.readFileSync('/etc/machine-id', 'utf8').trim() }));
    }
  } catch {}
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  const res = resolveSerial(fresh, cached);
  if (res) {
    if (res.save) { try { fs.writeFileSync(cacheFile, JSON.stringify({ serial: res.serial, parts: res.parts })); } catch {} }
    return res.serial;
  }
  // آخر احتياطي لو الهاردوير مش مقروء خالص (جهاز افتراضي مثلًا): رقم عشوائي بيتخزن مرة واحدة
  const f = path.join(userData, 'device-id');
  let raw = '';
  try { raw = fs.readFileSync(f, 'utf8').trim(); } catch {}
  if (!raw) { raw = crypto.randomUUID(); try { fs.writeFileSync(f, raw); } catch {} }
  const hex = crypto.createHash('sha256').update('labresults-fallback|' + raw).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g).join('-');
}

let win;
const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };

function setupUpdater() {
  if (!app.isPackaged) return; // التحديث بيشتغل في النسخة المثبتة بس
  // التحديثات بتتسحب من GitHub Releases (المستودع لازم يكون Public)
  const [owner, repo] = String(config.GITHUB_REPO || '').split('/');
  if (!owner || !repo) return;
  autoUpdater.setFeedURL({ provider: 'github', owner, repo });
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', (i) => send('update:available', { version: i.version }));
  autoUpdater.on('update-not-available', () => send('update:none'));
  autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', () => send('update:ready'));
  // 404 معناها مفيش إصدار منشور لسه على السيرفر = المعمل على آخر إصدار (مش عطل)
  autoUpdater.on('error', (e) => {
    const m = String((e && e.message) || e);
    if (/404|ENOENT|Cannot find latest/i.test(m)) send('update:none');
    else send('update:error', 'تعذر الاتصال بسيرفر التحديثات');
  });
}

ipcMain.on('config', (e) => {
  e.returnValue = { ...config, serial: SERIAL, version: app.getVersion(), packaged: app.isPackaged };
});
ipcMain.handle('update:check', async () => {
  if (!app.isPackaged) return { dev: true };
  try { await autoUpdater.checkForUpdates(); return {}; } catch (e) { return /404|ENOENT/i.test(String((e && e.message) || e)) ? {} : { error: 'تعذر الاتصال بسيرفر التحديثات' }; }
});
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
// تثبيت صامت فوق النسخة الحالية: من غير حذف، وبيانات الدخول بتفضل زي ما هي
ipcMain.on('update:install', () => autoUpdater.quitAndInstall(true, true));

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a1216' : '#f3f6f9',
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    title: config.APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true, // عارض PDF المدمج
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  if (app.isPackaged) {
    win.webContents.once('did-finish-load', () =>
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000));
  }
}

// نسخة واحدة بس مفتوحة
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { SERIAL = computeSerial(); setupUpdater(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
