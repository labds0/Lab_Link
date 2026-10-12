const D = window.desktop;
const CFG = D.config;
const API = CFG.API_URL.replace(/\/$/, '');
const APP_NAME = CFG.APP_NAME;
const SERIAL = CFG.serial;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
};

/* ---------- أيقونات + ثيم ---------- */
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.7-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = ic(el.dataset.i); el.removeAttribute('data-i'); }); }
function syncThemeBtns() {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.querySelectorAll('.theme-toggle').forEach((b) => { b.innerHTML = ic(dark ? 'sun' : 'moon'); b.title = dark ? 'الوضع النهاري' : 'الوضع الليلي'; });
}
document.querySelectorAll('.theme-toggle').forEach((b) => b.addEventListener('click', () => window.toggleTheme()));
document.addEventListener('themechange', syncThemeBtns);
const AV = [['#14b8a6', '#0e7490'], ['#6366f1', '#4338ca'], ['#f59e0b', '#d97706'], ['#ec4899', '#be185d'], ['#10b981', '#047857'], ['#0ea5e9', '#0369a1'], ['#8b5cf6', '#6d28d9']];
function avatar(name, cls = '') {
  const t = String(name || '?').trim();
  let h = 0; for (const ch of t) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const [a, b] = AV[h % AV.length];
  return `<span class="avatar ${cls}" style="background:linear-gradient(135deg,${a},${b})">${esc([...t][0] || '?')}</span>`;
}

let token = store.get('lab_token');
let lab = store.get('lab_info');
let patients = [];
let selected = null; // {code, name}
let viewUrl = null;

/* ---------- helpers ---------- */
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}), 'X-Serial': SERIAL };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(API + path, { ...opts, headers, body });
  } catch {
    throw new Error('مفيش اتصال بالإنترنت أو السيرفر');
  }
  if (res.status === 401 && token && !path.includes('/login')) {
    logout();
    throw new Error('انتهت الجلسة، سجّل الدخول من جديد');
  }
  if (!res.ok) {
    let d = {};
    try { d = await res.json(); } catch {}
    const err = new Error(d.error || 'حصل خطأ');
    err.code = d.code;
    throw err;
  }
  return res;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add('hidden'), 2800);
}
function openModal(html, cls = '') {
  const c = $('#modalCard');
  c.className = 'modal-card' + (cls === true ? ' wide' : cls ? ' ' + cls : '');
  c.innerHTML = html;
  $('#modal').classList.remove('hidden');
  return c;
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalCard').innerHTML = '';
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
}
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
$('#modalX').innerHTML = ic('x');
$('#modalX').onclick = closeModal;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
const fmtDate = (t) => new Date(t).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('تم النسخ'); } catch { toast('تعذر النسخ'); }
}

/* ---------- تفعيل الجهاز + تسجيل الدخول ---------- */
function authMsg(text, ok = false) {
  const m = $('#authMsg');
  m.textContent = text;
  m.classList.toggle('ok', ok);
}
function showAuth(mode, labName = '', logo = '') {
  $('#main').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#authTitle').textContent = labName || APP_NAME;
  $('#authLogo').src = logo || 'logo.svg';
  $('#authSub').textContent = mode === 'login' ? 'سجّل الدخول لإدارة المرضى والنتائج' : '';
  $('#activateBox').classList.toggle('hidden', mode !== 'activate');
  $('#loginForm').classList.toggle('hidden', mode !== 'login');
  $('#retryBtn').classList.toggle('hidden', mode !== 'offline');
  if (mode === 'activate') $('#serialText').textContent = SERIAL;
  document.title = labName || APP_NAME;
}
async function checkDevice() {
  authMsg('');
  try {
    const st = await (await api('/api/device/status?serial=' + encodeURIComponent(SERIAL))).json();
    if (st.activated) showAuth('login', st.labName, st.logo);
    else showAuth('activate');
  } catch (err) {
    showAuth('offline');
    authMsg(err.message);
  }
}
$('#retryBtn').onclick = checkDevice;
$('#copySerial').onclick = () => copyText(SERIAL);

$('#activateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  authMsg('');
  try {
    const d = await (await api('/api/device/activate', { method: 'POST', body: { serial: SERIAL, code: new FormData(e.target).get('code') } })).json();
    e.target.reset();
    showAuth('login', d.labName, d.logo);
    authMsg('تم التفعيل. ادخل باسم المستخدم admin وكلمة السر 1234', true);
  } catch (err) { authMsg(err.message); }
});

function saveSession(d) {
  token = d.token; lab = d.lab;
  store.set('lab_token', token); store.set('lab_info', lab);
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  authMsg('');
  try {
    saveSession(await (await api('/api/lab/login', { method: 'POST', body: { serial: SERIAL, ...f } })).json());
    e.target.reset();
    showMain();
  } catch (err) {
    if (err.code === 'NOT_ACTIVATED') showAuth('activate');
    authMsg(err.message);
  }
});

function showMain() {
  $('#auth').classList.add('hidden');
  $('#main').classList.remove('hidden');
  renderHeader();
  loadPatients();
}
function renderHeader() {
  $('#appName').textContent = lab.labName || APP_NAME;
  $('#labInfo').textContent = `فرع ${lab.branch}${lab.address ? ' • ' + lab.address : ''}`;
  $('#topLogo').src = lab.logo || 'logo.svg';
  document.title = lab.labName || APP_NAME;
  $('#pwWarn').classList.toggle('hidden', !lab.defaultPw);
}
function logout() {
  token = null; lab = null; selected = null; patients = [];
  store.del('lab_token'); store.del('lab_info');
  closeModal();
  showEmpty();
  checkDevice();
}
$('#logoutBtn').onclick = logout;
function showEmpty() {
  $('#results').innerHTML = `<div class="empty"><div class="ill">${ic('users')}</div><div>اختار مريض من القائمة أو أضف مريض جديد</div></div>`;
}

/* ---------- تجهيز اللوجو: تصغير لـ 256px وتحويل PNG (يحافظ على الشفافية) ---------- */
function fileToLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 256;
      for (let i = 0; i < 5; i++) {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/png');
        if (out.length <= 250000) return resolve(out);
        max = Math.round(max * 0.7);
      }
      reject(new Error('الصورة كبيرة قوي، اختار لوجو أبسط'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('الملف ده مش صورة صالحة')); };
    img.src = url;
  });
}

/* ---------- الإعدادات ---------- */
$('#settingsBtn').onclick = () => openSettings();
$('#pwWarnBtn').onclick = () => openSettings();

async function openSettings() {
  const isAdmin = lab.role === 'admin';
  let users = [];
  if (isAdmin) {
    try { users = (await (await api('/api/lab/users')).json()).users; } catch (err) { toast(err.message); return; }
  }
  const usersHtml = users.map((u) => `<div class="urow" data-u="${esc(u.username)}">
      <span class="nm">${esc(u.username)}</span>
      <span class="badge ${u.role === 'admin' ? '' : 'staff'}">${u.role === 'admin' ? 'مدير' : 'موظف'}</span>
      <input type="password" placeholder="كلمة سر جديدة" data-f="pw">
      <button class="btn sm" data-act="pw">تعيين</button>
      <button class="btn sm" data-act="role">${u.role === 'admin' ? 'خليه موظف' : 'خليه مدير'}</button>
      <button class="btn sm danger" data-act="del">حذف</button>
    </div>`).join('');

  openModal(`<h3>الإعدادات</h3>

    <div class="sec" style="margin-top:0">
      <h4>حسابي</h4>
      <form id="meForm">
        <div class="row2">
          <label>اسم المستخدم<input name="username" dir="ltr" value="${esc(lab.username)}" required></label>
          <label>كلمة سر جديدة (سيبها فاضية لو مش هتغيرها)<input name="password" type="password" autocomplete="new-password"></label>
        </div>
        <label>كلمة السر الحالية (للتأكيد)<input name="current" type="password" autocomplete="current-password" required></label>
        <button class="btn primary" type="submit">حفظ</button>
      </form>
    </div>

    ${isAdmin ? `
    <div class="sec">
      <h4>بيانات المعمل</h4>
      <form id="infoForm">
        <div class="logo-up">
          <div class="logo-prev"><img id="logoPrev" src="${esc(lab.logo || 'logo.svg')}" alt=""></div>
          <div class="t">
            <b>لوجو المعمل</b>
            <span class="hint">بيظهر للمريض في نسخة الموبايل بدل اللوجو الافتراضي، وعلى الطباعة. يفضّل صورة مربعة (PNG بخلفية شفافة).</span>
            <div class="row">
              <button type="button" class="btn sm" id="logoPick">${ic('upload')}اختيار لوجو</button>
              <button type="button" class="btn sm danger ${lab.logo ? '' : 'hidden'}" id="logoRemove">${ic('trash')}إزالة</button>
            </div>
          </div>
        </div>
        <label>اسم المعمل (بيظهر للمريض)<input name="labName" value="${esc(lab.labName)}" required></label>
        <div class="row2">
          <label>رقم الفرع<input name="branch" value="${esc(lab.branch)}" required></label>
          <label>العنوان<input name="address" value="${esc(lab.address)}"></label>
        </div>
        <button class="btn primary" type="submit">حفظ</button>
      </form>
    </div>

    <div class="sec">
      <h4>المستخدمين</h4>
      ${usersHtml}
      <form id="addUserForm" style="margin-top:14px">
        <div class="row2">
          <label>اسم مستخدم جديد<input name="username" dir="ltr" required></label>
          <label>كلمة السر<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
        </div>
        <label><select name="role" style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;font-family:inherit">
          <option value="staff">موظف (يرفع النتايج ويضيف المرضى)</option><option value="admin">مدير (كمان يدير المستخدمين والإعدادات)</option></select></label>
        <button class="btn primary" type="submit">+ إضافة مستخدم</button>
      </form>
    </div>` : ''}

    <div class="sec">
      <h4>عن البرنامج</h4>
      <div class="serial-box"><span>رقم الجهاز</span><b>${esc(SERIAL)}</b><button class="btn sm" id="copySerial2">${ic('copy')}نسخ</button></div>
      <p class="hint">الإصدار ${esc(CFG.version)}</p>
    </div>
    <div class="modal-actions"><button class="btn" id="setClose">إغلاق</button></div>`, 'settings');

  $('#setClose').onclick = closeModal;
  $('#copySerial2').onclick = () => copyText(SERIAL);

  $('#meForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      saveSession(await (await api('/api/lab/me', { method: 'POST', body: f })).json());
      renderHeader();
      toast('تم الحفظ');
      openSettings();
    } catch (err) { toast(err.message); }
  };
  if (!isAdmin) return;
  let pendingLogo; // undefined = من غير تغيير، '' = إزالة، data URL = لوجو جديد
  const showLogo = (src) => { $('#logoPrev').src = src || 'logo.svg'; $('#logoRemove').classList.toggle('hidden', !src); };
  const logoInput = document.createElement('input');
  logoInput.type = 'file'; logoInput.accept = 'image/png,image/jpeg,image/webp'; logoInput.hidden = true;
  $('#logoPick').onclick = () => { logoInput.value = ''; logoInput.click(); };
  logoInput.onchange = async () => {
    if (!logoInput.files[0]) return;
    try { pendingLogo = await fileToLogo(logoInput.files[0]); showLogo(pendingLogo); toast('اضغط حفظ لتثبيت اللوجو'); }
    catch (err) { toast(err.message); }
  };
  $('#logoRemove').onclick = () => { pendingLogo = ''; showLogo(''); toast('اضغط حفظ لتثبيت الإزالة'); };
  $('#infoForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (pendingLogo !== undefined) body.logo = pendingLogo;
    try {
      const d = await (await api('/api/lab/info', { method: 'POST', body })).json();
      lab = d.lab; store.set('lab_info', lab); renderHeader(); pendingLogo = undefined; toast('تم الحفظ');
    } catch (err) { toast(err.message); }
  };
  $('#addUserForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('/api/lab/users', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('تمت الإضافة');
      openSettings();
    } catch (err) { toast(err.message); }
  };
  $('#modalCard').querySelectorAll('.urow').forEach((row) => {
    const u = row.dataset.u;
    const user = users.find((x) => x.username === u);
    const base = '/api/lab/users/' + encodeURIComponent(u);
    row.querySelector('[data-act=pw]').onclick = async () => {
      const pw = row.querySelector('[data-f=pw]').value;
      try { await api(base + '/password', { method: 'POST', body: { password: pw } }); toast('تم تغيير كلمة السر'); row.querySelector('[data-f=pw]').value = ''; }
      catch (err) { toast(err.message); }
    };
    row.querySelector('[data-act=role]').onclick = async () => {
      try { await api(base + '/role', { method: 'POST', body: { role: user.role === 'admin' ? 'staff' : 'admin' } }); openSettings(); }
      catch (err) { toast(err.message); }
    };
    row.querySelector('[data-act=del]').onclick = async () => {
      if (!confirm(`حذف المستخدم ${u}؟`)) return;
      try { await api(base, { method: 'DELETE' }); openSettings(); } catch (err) { toast(err.message); }
    };
  });
}

/* ---------- patients ---------- */
async function loadPatients() {
  try {
    patients = (await (await api('/api/lab/patients')).json()).patients;
    renderPatients();
  } catch (err) { toast(err.message); }
}
/* ---------- فلتر اليوم / الفترة (من - إلى) ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const dkey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayKey = () => dkey(new Date());
const keyDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dkey(d); };
const nfAr = new Intl.NumberFormat('ar-EG');
const fmtDay = (k) => { const d = keyDate(k); const o = { weekday: 'long', day: 'numeric', month: 'long' }; if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric'; return d.toLocaleDateString('ar-EG', o); };
const fmtShortDay = (k) => { const d = keyDate(k); const o = { day: 'numeric', month: 'short' }; if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric'; return d.toLocaleDateString('ar-EG', o); };
const countText = (n) => (n === 0 ? 'لا مرضى' : n === 1 ? 'مريض واحد' : n === 2 ? 'مريضان' : n <= 10 ? `${nfAr.format(n)} مرضى` : `${nfAr.format(n)} مريضًا`);
// auto = بيتابع "النهاردة" (حتى لو البرنامج فضل مفتوح بعد منتصف الليل)
let flt = { auto: true, all: false, from: '', to: '' };
let calOpen = false, calView = new Date(), lastDay = todayKey();
const fltRange = () => (flt.auto ? { from: todayKey(), to: todayKey() } : flt);
const inFilter = (p) => { if (flt.all) return true; const k = dkey(new Date(p.created)); const r = fltRange(); return k >= r.from && k <= r.to; };
function setToday() { flt = { auto: true, all: false, from: '', to: '' }; calView = new Date(); }
function setRange(from, to) {
  if (from > to) [from, to] = [to, from];
  if (from === todayKey() && to === todayKey()) return setToday();
  flt = { auto: false, all: false, from, to };
}

function renderDay() {
  const r = fltRange(), t = todayKey(), y = addDays(t, -1);
  const n = patients.filter(inFilter).length;
  let lbl, title;
  if (flt.all) { lbl = 'كل الأيام'; title = 'كل المرضى'; }
  else if (r.from === r.to) { lbl = r.from === t ? 'اليوم' : r.from === y ? 'أمس' : 'يوم محدد'; title = fmtDay(r.from); }
  else { lbl = 'الفترة'; title = `${fmtShortDay(r.from)} – ${fmtShortDay(r.to)}`; }
  $('#dayLbl').textContent = lbl;
  $('#dayTitle').textContent = title;
  $('#dayCount').textContent = countText(n);
  $('#dayToggle').classList.toggle('open', calOpen);
  $('#cal').classList.toggle('hidden', !calOpen);
  const act = flt.all ? 'all' : r.from === t && r.to === t ? 'today' : r.from === y && r.to === y ? 'yest' : r.to === t && r.from === addDays(t, -6) ? '7' : '';
  document.querySelectorAll('#dayChips [data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === act));
  $('#dFrom').value = flt.all ? '' : r.from;
  $('#dTo').value = flt.all ? '' : r.to;
  if (calOpen) renderCal();
}
function renderCal() {
  const y = calView.getFullYear(), m = calView.getMonth();
  const counts = {};
  patients.forEach((p) => { const k = dkey(new Date(p.created)); counts[k] = (counts[k] || 0) + 1; });
  const offset = (new Date(y, m, 1).getDay() + 1) % 7; // الأسبوع بيبدأ السبت
  const total = new Date(y, m + 1, 0).getDate();
  const r = fltRange(), t = todayKey();
  const from = flt.all ? '' : r.from, to = flt.all ? '' : r.to;
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= total; d++) {
    const k = `${y}-${pad2(m + 1)}-${pad2(d)}`;
    const cls = ['d', k === t ? 'today' : '', counts[k] ? 'has' : '', k === from || k === to ? 'sel' : from && k > from && k < to ? 'rng' : ''].join(' ');
    cells += `<button type="button" class="${cls}" data-k="${k}" title="${counts[k] ? countText(counts[k]) : ''}">${nfAr.format(d)}</button>`;
  }
  $('#cal').innerHTML = `<div class="cal-head">
      <button type="button" class="cal-nav" data-nav="-1" title="الشهر السابق">${ic('chevR')}</button>
      <b>${calView.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</b>
      <button type="button" class="cal-nav" data-nav="1" title="الشهر التالي">${ic('chevL')}</button></div>
    <div class="cal-grid">${['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'].map((x) => `<span class="dn">${x}</span>`).join('')}${cells}</div>`;
}
$('#dayToggle').onclick = () => {
  calOpen = !calOpen;
  if (calOpen) calView = flt.all ? new Date() : keyDate(fltRange().to);
  renderDay();
};
$('#cal').addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]'), day = e.target.closest('[data-k]');
  if (nav) { calView = new Date(calView.getFullYear(), calView.getMonth() + Number(nav.dataset.nav), 1); renderCal(); }
  else if (day) { setRange(day.dataset.k, day.dataset.k); calOpen = false; renderPatients(); }
});
$('#dayChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-q]');
  if (!b) return;
  const t = todayKey(), q = b.dataset.q;
  if (q === 'today') setToday();
  else if (q === 'yest') setRange(addDays(t, -1), addDays(t, -1));
  else if (q === '7') setRange(addDays(t, -6), t);
  else flt = { auto: false, all: true, from: '', to: '' };
  calOpen = false;
  renderPatients();
});
function onRangeInput() {
  const f = $('#dFrom').value, t = $('#dTo').value;
  if (!f && !t) return;
  setRange(f || t, t || f);
  renderPatients();
}
$('#dFrom').addEventListener('change', onRangeInput);
$('#dTo').addEventListener('change', onRangeInput);
setInterval(() => { if (flt.auto && lastDay !== todayKey()) { lastDay = todayKey(); renderPatients(); } }, 60000);

function renderPatients() {
  const q = $('#search').value.trim().toLowerCase();
  // البحث بيدوّر في كل المرضى، ومن غير بحث بيظهر مرضى اليوم/الفترة المختارة بس (الأحدث فوق)
  const list = q
    ? patients.filter((p) => p.name.toLowerCase().includes(q) || p.code.includes(q))
    : patients.filter(inFilter).sort((a, b) => b.created - a.created);
  renderDay();
  $('#patientList').innerHTML = list.length
    ? list.map((p) => `<li data-code="${esc(p.code)}" class="${selected?.code === p.code ? 'active' : ''}">${avatar(p.name)}<span class="pn"><b>${esc(p.name)}</b><small>${esc(p.code)}</small></span><span class="tm">${new Date(p.created).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span></li>`).join('')
    : `<li class="none">${q ? 'لا توجد نتائج للبحث' : 'لا يوجد مرضى في هذه الفترة'}</li>`;
}
$('#search').addEventListener('input', renderPatients);
$('#patientList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-code]');
  if (!li) return;
  const p = patients.find((x) => x.code === li.dataset.code);
  if (p) selectPatient(p);
});

/* ---------- WhatsApp ---------- */
// الرقم بيتخزن على الجهاز ده بس (مش على السيرفر)
const getPhone = (code) => (store.get('phones') || {})[code] || '';
const savePhone = (code, ph) => store.set('phones', { ...(store.get('phones') || {}), [code]: ph });
function waNumber(raw) {
  let n = String(raw).replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = '20' + n.slice(1); // مصر
  return n.length >= 10 ? n : '';
}
function waMessage(d) {
  const base = (CFG.MOBILE_URL || '').trim();
  const lines = [`أهلًا ${d.name}، نتيجتك جاهزة من ${lab.labName || APP_NAME} 🧪`];
  if (base) lines.push(`افتح الرابط: ${base}${base.includes('#') ? '' : '#'}c=${d.code}&p=${d.password}`);
  lines.push(`${base ? 'أو ادخل يدوي: ' : ''}الكود ${d.code} / كلمة السر ${d.password}`);
  return lines.join('\n');
}
function openWhatsApp(d, phone) {
  const n = waNumber(phone);
  if (!n) { toast('اكتب رقم صحيح'); return false; }
  savePhone(d.code, phone);
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(waMessage(d))}`, '_blank');
  return true;
}

function credsHtml(d, title) {
  return `<h3>${title}</h3>
    <div class="cred">
      <div><span>الاسم</span><b style="font-size:17px;letter-spacing:0">${esc(d.name)}</b></div>
      <div><span>كود المريض</span><b>${esc(d.code)}</b></div>
      <div><span>كلمة السر</span><b>${esc(d.password)}</b></div>
    </div>
    <p class="hint">كلمة السر بتظهر مرة واحدة بس. اطبعها أو سلّمها للمريض دلوقتي. لو ضاعت تقدر تعمل كلمة سر جديدة.</p>
    <label class="wa-row">رقم واتساب المريض<input id="waPhone" inputmode="tel" dir="ltr" placeholder="01012345678" value="${esc(getPhone(d.code))}"></label>
    <div class="modal-actions">
      <button class="btn primary" id="waCred">${ic('chat')}إرسال واتساب</button>
      <button class="btn" id="printCred">${ic('print')}طباعة</button>
      <button class="btn" id="copyCred">${ic('copy')}نسخ</button>
      <button class="btn ghost" id="closeCred">إغلاق</button>
    </div>`;
}
function bindCreds(d) {
  $('#printCred').onclick = () => {
    $('#printArea').innerHTML = `<img src="${esc(lab.logo || 'logo.svg')}" alt=""><h2>${esc(lab.labName || APP_NAME)}</h2><p>فرع ${esc(lab.branch)}</p><p>${esc(d.name)}</p>
      <p>كود المريض</p><div class="big">${esc(d.code)}</div><p>كلمة السر</p><div class="big">${esc(d.password)}</div>`;
    window.print();
  };
  $('#copyCred').onclick = async () => {
    try { await navigator.clipboard.writeText(`الاسم: ${d.name}\nالكود: ${d.code}\nكلمة السر: ${d.password}`); toast('تم النسخ'); } catch { toast('تعذر النسخ'); }
  };
  $('#waCred').onclick = () => openWhatsApp(d, $('#waPhone').value);
  $('#closeCred').onclick = closeModal;
}

$('#newPatientBtn').onclick = () => {
  openModal(`<h3>مريض جديد</h3>
    <form id="npForm"><label>اسم المريض<input name="name" required autofocus></label>
    <div class="modal-actions"><button class="btn primary" type="submit">إنشاء</button><button type="button" class="btn ghost" id="npCancel">إلغاء</button></div></form>`);
  $('#npCancel').onclick = closeModal;
  $('#npForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get('name');
    try {
      const d = await (await api('/api/lab/patients', { method: 'POST', body: { name } })).json();
      $('#modalCard').innerHTML = credsHtml(d, 'تم إنشاء المريض');
      bindCreds(d);
      setToday();
      await loadPatients();
      selectPatient({ code: d.code, name: d.name });
    } catch (err) { toast(err.message); }
  };
};

/* ---------- results ---------- */
async function selectPatient(p) {
  selected = { code: p.code, name: p.name };
  renderPatients();
  $('#results').innerHTML = '<div class="empty">...</div>';
  try {
    const { results } = await (await api(`/api/lab/patients/${p.code}/results`)).json();
    if (selected?.code !== p.code) return;
    renderResults(results);
  } catch (err) { $('#results').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

function renderResults(results) {
  const p = selected;
  const head = `<div class="phead">
      <div class="who">${avatar(p.name)}<div><h2>${esc(p.name)}</h2><span class="chip">كود المريض <b>${esc(p.code)}</b></span></div></div>
      <div class="actions">
        <button class="btn primary" id="attachBtn">${ic('upload')}إرفاق نتيجة PDF</button>
        <button class="btn" id="resetBtn">${ic('key')}كلمة سر جديدة</button>
        <button class="btn danger" id="delPatientBtn">${ic('trash')}حذف المريض</button>
      </div></div>`;
  const body = results.length
    ? results.map((r) => `<div class="file" data-id="${esc(r.id)}">
        <span class="ico">${ic('file')}</span>
        <div class="meta"><b>${esc(r.name)}</b><small>${fmtDate(r.date)} • ${fmtSize(r.size)}</small></div>
        <div class="btns">
        <button class="btn sm" data-act="view">${ic('eye')}عرض</button>
        <button class="btn sm" data-act="download">${ic('download')}تحميل</button>
        <button class="btn sm danger" data-act="del">${ic('trash')}حذف</button></div></div>`).join('')
    : `<div class="noresults"><div class="ill">${ic('file')}</div><p>لا توجد نتائج لهذا المريض</p><button class="btn primary" id="attachBtn2">${ic('upload')}اختيار وإرفاق النتائج</button></div>`;
  $('#results').innerHTML = head + (results.length ? `<h3 class="sectitle">النتائج (${results.length})</h3>` : '') + body;

  $('#attachBtn').onclick = pickFiles;
  if ($('#attachBtn2')) $('#attachBtn2').onclick = pickFiles;
  $('#resetBtn').onclick = async () => {
    if (!confirm('عمل كلمة سر جديدة للمريض؟ الكلمة القديمة هتتلغي.')) return;
    try {
      const d = await (await api(`/api/lab/patients/${p.code}/reset`, { method: 'POST' })).json();
      openModal(credsHtml(d, 'كلمة السر الجديدة')); bindCreds(d);
    } catch (err) { toast(err.message); }
  };
  $('#delPatientBtn').onclick = async () => {
    if (!confirm(`حذف ${p.name} وكل نتايجه نهائيًا؟`)) return;
    try {
      await api(`/api/lab/patients/${p.code}`, { method: 'DELETE' });
      selected = null;
      showEmpty();
      loadPatients();
    } catch (err) { toast(err.message); }
  };
  $('#results').querySelectorAll('.file').forEach((el) => {
    const r = results.find((x) => x.id === el.dataset.id);
    el.querySelector('[data-act=view]').onclick = () => viewFile(r);
    el.querySelector('[data-act=download]').onclick = () => downloadFile(r);
    el.querySelector('[data-act=del]').onclick = async () => {
      if (!confirm('حذف الملف ده؟')) return;
      try { await api(`/api/lab/patients/${p.code}/results/${r.id}`, { method: 'DELETE' }); selectPatient(p); } catch (err) { toast(err.message); }
    };
  });
}

function pickFiles() { $('#fileInput').value = ''; $('#fileInput').click(); }
$('#fileInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  const p = selected;
  if (!p || !files.length) return;
  let ok = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('name', f.name);
    try { toast(`جاري رفع ${f.name}...`); await api(`/api/lab/patients/${p.code}/results`, { method: 'POST', body: fd }); ok++; }
    catch (err) { toast(`${f.name}: ${err.message}`); await new Promise((r) => setTimeout(r, 1800)); }
  }
  if (ok) toast(`تم رفع ${ok} ملف`);
  if (selected?.code === p.code) selectPatient(p);
});

async function fetchPdf(r) {
  const res = await api(`/api/files/${selected.code}/${r.id}`);
  return new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
}
async function viewFile(r) {
  try {
    const blob = await fetchPdf(r);
    viewUrl = URL.createObjectURL(blob);
    openModal(`<h3>${esc(r.name)}</h3><iframe src="${viewUrl}"></iframe>
      <div class="modal-actions"><button class="btn" id="vClose">إغلاق</button></div>`, true);
    $('#vClose').onclick = closeModal;
  } catch (err) { toast(err.message); }
}
async function downloadFile(r) {
  try {
    const blob = await fetchPdf(r);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = r.name + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) { toast(err.message); }
}

/* ---------- تحديث البرنامج ---------- */
let manualCheck = false;
function setupUpdates() {
  $('#ver').textContent = 'v' + CFG.version;
  const bar = $('#updBar');
  D.onUpdate((ev, d) => {
    if (ev === 'available') {
      bar.classList.remove('hidden');
      bar.innerHTML = `<span>يوجد إصدار جديد ${esc(d.version)}</span><button class="btn sm primary" id="updGo">تحديث الآن</button>`;
      $('#updGo').onclick = () => { bar.innerHTML = '<span>جاري التنزيل 0%</span>'; D.downloadUpdate(); };
    } else if (ev === 'progress') {
      bar.innerHTML = `<span>جاري التنزيل ${d.percent}%</span>`;
    } else if (ev === 'ready') {
      bar.classList.remove('hidden');
      bar.innerHTML = '<span>التحديث جاهز</span><button class="btn sm primary" id="updInstall">إعادة التشغيل وتثبيت</button>';
      $('#updInstall').onclick = () => D.installUpdate();
    } else if (ev === 'none') {
      if (manualCheck) toast('إنت على آخر إصدار');
      manualCheck = false;
    } else if (ev === 'error') {
      if (manualCheck) toast(String(d).slice(0, 120));
      manualCheck = false;
    }
  });
  $('#updBtn').onclick = async () => {
    manualCheck = true;
    const r = await D.checkUpdate();
    if (r.dev) { manualCheck = false; toast('التحديث بيشتغل في النسخة المثبتة بس'); }
    else if (r.error) { manualCheck = false; toast('تعذر فحص التحديث: ' + r.error); }
  };
}

/* ---------- start ---------- */
hydrateIcons();
syncThemeBtns();
showEmpty();
setupUpdates();
if (token && lab) showMain(); else checkDevice();
