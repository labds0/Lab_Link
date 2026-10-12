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
function showAuth(mode, labName = '') {
  $('#main').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#authTitle').textContent = labName || APP_NAME;
  $('#activateBox').classList.toggle('hidden', mode !== 'activate');
  $('#loginForm').classList.toggle('hidden', mode !== 'login');
  $('#retryBtn').classList.toggle('hidden', mode !== 'offline');
  if (mode === 'activate') $('#serialText').textContent = SERIAL;
  document.title = APP_NAME;
}
async function checkDevice() {
  authMsg('');
  try {
    const st = await (await api('/api/device/status?serial=' + encodeURIComponent(SERIAL))).json();
    if (st.activated) showAuth('login', st.labName);
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
    showAuth('login', d.labName);
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
  $('#appName').textContent = APP_NAME;
  $('#labInfo').textContent = `${lab.labName} — فرع ${lab.branch}`;
  $('#pwWarn').classList.toggle('hidden', !lab.defaultPw);
}
function logout() {
  token = null; lab = null; selected = null; patients = [];
  store.del('lab_token'); store.del('lab_info');
  closeModal();
  $('#results').innerHTML = '<div class="empty">اختار مريض من القائمة</div>';
  checkDevice();
}
$('#logoutBtn').onclick = logout;

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

    <div class="sec" style="border:0;margin-top:0;padding-top:0">
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
        <label>اسم المعمل<input name="labName" value="${esc(lab.labName)}" required></label>
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
      <div class="serial-box"><span>رقم الجهاز</span><b>${esc(SERIAL)}</b><button class="btn sm" id="copySerial2">نسخ</button></div>
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
  $('#infoForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = await (await api('/api/lab/info', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) })).json();
      lab = d.lab; store.set('lab_info', lab); renderHeader(); toast('تم الحفظ');
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
function renderPatients() {
  const q = $('#search').value.trim().toLowerCase();
  const list = patients.filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.includes(q));
  $('#patientList').innerHTML = list.length
    ? list.map((p) => `<li data-code="${esc(p.code)}" class="${selected?.code === p.code ? 'active' : ''}"><span>${esc(p.name)}</span><small>${esc(p.code)}</small></li>`).join('')
    : '<li style="cursor:default;color:var(--mut)">لا يوجد مرضى</li>';
}
$('#search').addEventListener('input', renderPatients);
$('#patientList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-code]');
  if (!li) return;
  const p = patients.find((x) => x.code === li.dataset.code);
  if (p) selectPatient(p);
});

function credsHtml(d, title) {
  return `<h3>${title}</h3>
    <div class="cred">
      <div><span>الاسم</span><b style="font-size:17px;letter-spacing:0">${esc(d.name)}</b></div>
      <div><span>كود المريض</span><b>${esc(d.code)}</b></div>
      <div><span>كلمة السر</span><b>${esc(d.password)}</b></div>
    </div>
    <p class="hint">كلمة السر بتظهر مرة واحدة بس. اطبعها أو سلّمها للمريض دلوقتي. لو ضاعت تقدر تعمل كلمة سر جديدة.</p>
    <div class="modal-actions">
      <button class="btn primary" id="printCred">طباعة</button>
      <button class="btn" id="copyCred">نسخ</button>
      <button class="btn ghost" id="closeCred">إغلاق</button>
    </div>`;
}
function bindCreds(d) {
  $('#printCred').onclick = () => {
    $('#printArea').innerHTML = `<h2>${esc(APP_NAME)}</h2><p>${esc(lab.labName)} — فرع ${esc(lab.branch)}</p><p>${esc(d.name)}</p>
      <p>كود المريض</p><div class="big">${esc(d.code)}</div><p>كلمة السر</p><div class="big">${esc(d.password)}</div>`;
    window.print();
  };
  $('#copyCred').onclick = async () => {
    try { await navigator.clipboard.writeText(`الاسم: ${d.name}\nالكود: ${d.code}\nكلمة السر: ${d.password}`); toast('تم النسخ'); } catch { toast('تعذر النسخ'); }
  };
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
      <div><h2>${esc(p.name)}</h2><span class="code">كود المريض: ${esc(p.code)}</span></div>
      <div class="actions">
        <button class="btn primary" id="attachBtn">إرفاق نتيجة PDF</button>
        <button class="btn" id="resetBtn">كلمة سر جديدة</button>
        <button class="btn danger" id="delPatientBtn">حذف المريض</button>
      </div></div>`;
  const body = results.length
    ? results.map((r) => `<div class="file" data-id="${esc(r.id)}">
        <span class="ico">📄</span>
        <div class="meta"><b>${esc(r.name)}</b><small>${fmtDate(r.date)} • ${fmtSize(r.size)}</small></div>
        <button class="btn sm" data-act="view">عرض</button>
        <button class="btn sm" data-act="download">تحميل</button>
        <button class="btn sm danger" data-act="del">حذف</button></div>`).join('')
    : `<div class="noresults"><p>لا توجد نتائج</p><button class="btn primary" id="attachBtn2">اختيار وإرفاق النتائج</button></div>`;
  $('#results').innerHTML = head + body;

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
      $('#results').innerHTML = '<div class="empty">اختار مريض من القائمة</div>';
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
      if (manualCheck) toast('تعذر فحص التحديث: ' + d);
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
setupUpdates();
if (token && lab) showMain(); else checkDevice();
