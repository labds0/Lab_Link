// Lab Link API — Cloudflare Worker + KV (DATA) — ملفات الـ PDF بتتخزن في KV كمان (من غير R2)
// Secrets: SECRET (توقيع الجلسات + توليد أكواد التفعيل: ماتغيّروش بعد ما تفعّل أجهزة), ADMIN_KEY (لوحة الأدمن بتاعتك)
// كل معمل = جهاز بسيريال ثابت. التفعيل بكود مرتبط بالسيريال، والدخول بيوزر/باسورد جوا الجهاز ده بس.

const enc = new TextEncoder();
const dec = new TextDecoder();
const MAX_PDF = 20 * 1024 * 1024; // 20MB
const TOKEN_TTL = 30 * 24 * 3600; // 30 يوم
const LINK_TTL = 14 * 24 * 3600; // صلاحية رابط الدخول المباشر للمريض: 14 يوم
const MAX_FAILS = 5; // محاولات فاشلة قبل القفل 15 دقيقة
const MAX_IP_FAILS = 20; // حد المحاولات الفاشلة لكل IP على دخول المرضى (بيحمي حصة الكتابة كمان)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,HEAD,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Admin-Key,X-Serial',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
const fail = (msg, status = 400) => json({ error: msg }, status);

/* ---------- crypto helpers ---------- */
function b64u(bytes) {
  const a = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}
const hmacKey = (env) =>
  crypto.subtle.importKey('raw', enc.encode(env.SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function signToken(env, payload) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return body + '.' + b64u(sig);
}
async function verifyToken(env, token) {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(fromB64u(body)));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}
const newSalt = () => b64u(crypto.getRandomValues(new Uint8Array(16)));
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64u(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  return b64u(bits);
}
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function randomDigits(n) {
  const a = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(a, (x) => x % 10).join('');
}
// كلمة سر المريض: 8 خانات من 32 رمز (من غير O/I/0/1 عشان ما يتلخبطوش) = 40 بت
const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomPassword(n = 8) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => PW_CHARS[x % 32]).join('');
}
// الدخول مش حساس لحالة الحروف ولا للشرطات والمسافات (والكلمات القديمة الرقمية بتفضل شغالة)
const normPw = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function randomCode() {
  // كود المريض: 6 أرقام ومش بيبدأ بصفر
  return String(1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9)) + randomDigits(5);
}

/* ---------- rate limit ---------- */
const isLocked = async (env, k, max = MAX_FAILS) => parseInt((await env.DATA.get('fail:' + k)) || '0', 10) >= max;
const addFail = async (env, k) => {
  const n = parseInt((await env.DATA.get('fail:' + k)) || '0', 10) + 1;
  await env.DATA.put('fail:' + k, String(n), { expirationTtl: 900 });
};
const clearFail = (env, k) => env.DATA.delete('fail:' + k);

/* ---------- serial / activation ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 حرف من غير O/I/0/1
const DEFAULT_ADMIN = { username: 'admin', password: '1234' };
const MIN_PW = 6; // الحد الأدنى لأي كلمة سر جديدة (الافتراضية 1234 استثناء)
const USERNAME_RE = /^[a-z0-9_.\-]{3,30}$/;

// سيريال الجهاز: 16 خانة hex بالشكل XXXX-XXXX-XXXX-XXXX
const normSerial = (s) => {
  const h = String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return /^[0-9A-F]{16}$/.test(h) ? h.match(/.{4}/g).join('-') : '';
};
const normCode = (s) => {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 12 ? c.match(/.{4}/g).join('-') : '';
};
// كود التفعيل ثابت لكل سيريال (HMAC بالـ SECRET) فتقدر تطلعه تاني في أي وقت
async function activationCode(env, serial) {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode('activate:' + serial)));
  const s = Array.from(sig.slice(0, 12), (x) => CODE_CHARS[x % 32]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const getDevice = (env, serial) => env.DATA.get('dev:' + serial, 'json');
const clientIp = (req) => req.headers.get('CF-Connecting-IP') || '';

/* ---------- هوية المعمل: الاسم + اللوجو (بتظهر للمريض بتاع المعمل ده بس) ---------- */
const MAX_LOGO = 300000; // حجم الـ data URL بالحروف (حوالي 220KB صورة)
const LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
// يرجّع { value } لو صالح (النص الفاضي = إزالة اللوجو) أو { error }
function parseLogo(v) {
  if (v === '' || v === null) return { value: '' };
  if (typeof v !== 'string' || v.length > MAX_LOGO || !LOGO_RE.test(v)) return { error: 'اللوجو لازم يكون صورة PNG أو JPG أو WEBP وحجمها صغير' };
  return { value: v };
}
// logo === undefined معناها سيب اللوجو الحالي زي ما هو
async function saveBrand(env, dev, logo) {
  const old = (await env.DATA.get('brand:' + dev.labId, 'json')) || {};
  const brand = { labName: dev.labName, logo: logo === undefined ? old.logo || '' : logo };
  await env.DATA.put('brand:' + dev.labId, JSON.stringify(brand));
  return brand;
}
async function getBrand(env, labId, dev) {
  const b = await env.DATA.get('brand:' + labId, 'json');
  if (b) return b;
  // معمل قديم قبل التحديث: نلاقي بياناته من سجل الجهاز ونخزنها مرة واحدة
  if (!dev) {
    for (const k of await listAll(env, 'dev:')) {
      const d = await env.DATA.get(k.name, 'json');
      if (d && d.labId === labId) { dev = d; break; }
    }
  }
  return dev ? await saveBrand(env, dev) : { labName: '', logo: '' };
}
const labInfo = async (env, dev, user) => ({
  labName: dev.labName,
  logo: (await getBrand(env, dev.labId, dev)).logo || '',
  address: dev.address,
  branch: dev.branch,
  username: user.username,
  role: user.role,
  defaultPw: !!user.defaultPw,
});

/* ---------- auth ---------- */
async function auth(req, env, role) {
  const h = req.headers.get('Authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const p = t ? await verifyToken(env, t) : null;
  if (!p || (role && p.role !== role)) return null;
  if (p.role === 'lab') {
    // التوكن مربوط بسيريال الجهاز: لازم نفس السيريال في الهيدر، والجهاز مفعّل وغير موقوف، واليوزر لسه موجود
    const serial = normSerial(req.headers.get('X-Serial'));
    if (!serial || serial !== p.s) return null;
    const [dev, user] = await Promise.all([getDevice(env, serial), env.DATA.get(`lu:${p.id}:${p.u}`, 'json')]);
    if (!dev || !dev.activatedAt || dev.blocked || dev.labId !== p.id || !user) return null;
    return { ...p, adm: user.role === 'admin', dev };
  }
  if (p.role !== 'patient') return null; // رابط الدخول (plink) مش جلسة، بيتبدل بجلسة من /api/patient/link-login بس
  return p;
}

async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
const clean = (s, max = 120) => String(s || '').trim().slice(0, max);

async function listAll(env, prefix) {
  const out = [];
  let cursor;
  do {
    const r = await env.DATA.list({ prefix, cursor });
    out.push(...r.keys);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out;
}

async function getOwnedPatient(env, labId, code) {
  const p = await env.DATA.get('patient:' + code, 'json');
  return p && p.labId === labId ? p : null;
}

/* ---------- users ---------- */
const putUser = (env, labId, u) =>
  env.DATA.put(`lu:${labId}:${u.username}`, JSON.stringify(u), { metadata: { username: u.username, role: u.role, created: u.created } });

async function makeUser(username, password, role, defaultPw = false) {
  const salt = newSalt();
  return { username, role, salt, hash: await hashPw(password, salt), defaultPw, created: Date.now() };
}
async function adminCount(env, labId) {
  return (await listAll(env, `lu:${labId}:`)).filter((k) => k.metadata?.role === 'admin').length;
}
const signLabToken = (env, dev, username) =>
  signToken(env, { role: 'lab', id: dev.labId, u: username, s: dev.serial, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL });

/* ---------- device activation + login ---------- */
async function deviceStatus(req, env) {
  const serial = normSerial(new URL(req.url).searchParams.get('serial'));
  const dev = serial ? await getDevice(env, serial) : null;
  const on = !!(dev && dev.activatedAt && !dev.blocked);
  return json({ activated: on, labName: on ? dev.labName : '', logo: on ? (await getBrand(env, dev.labId, dev)).logo || '' : '' });
}

async function deviceActivate(req, env) {
  const b = await readJson(req);
  const lock = 'act:' + clientIp(req);
  if (await isLocked(env, lock)) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  const serial = normSerial(b.serial);
  const code = normCode(b.code);
  const dev = serial ? await getDevice(env, serial) : null;
  if (!dev) {
    await addFail(env, lock);
    return fail('رقم الجهاز ده مش مسجّل، ابعته للشركة المزودة وهيبعتولك كود التفعيل', 403);
  }
  if (dev.blocked) return fail('الجهاز ده موقوف، كلّم الشركة المزودة', 403);
  if (!code || !safeEq(code, await activationCode(env, serial))) {
    await addFail(env, lock);
    return fail('كود التفعيل غلط', 403);
  }
  await clearFail(env, lock);
  if (!dev.activatedAt) {
    dev.activatedAt = Date.now();
    await env.DATA.put('dev:' + serial, JSON.stringify(dev));
  }
  return json({ ok: true, labName: dev.labName });
}

async function labLogin(req, env) {
  const b = await readJson(req);
  const serial = normSerial(b.serial);
  const username = clean(b.username, 30).toLowerCase();
  if (!serial) return fail('رقم الجهاز غير صالح');
  const lockKey = `lab:${serial}:${username}`;
  if (await isLocked(env, lockKey)) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  const dev = await getDevice(env, serial);
  if (!dev || !dev.activatedAt) return json({ error: 'الجهاز ده لسه متفعّلش', code: 'NOT_ACTIVATED' }, 403);
  if (dev.blocked) return fail('الجهاز ده موقوف، كلّم الشركة المزودة', 403);
  const user = await env.DATA.get(`lu:${dev.labId}:${username}`, 'json');
  const ok = user && safeEq(await hashPw(String(b.password || ''), user.salt), user.hash);
  if (!ok) {
    await addFail(env, lockKey);
    return fail('اسم المستخدم أو كلمة السر غلط', 401);
  }
  await clearFail(env, lockKey);
  return json({ token: await signLabToken(env, dev, user.username), lab: await labInfo(env, dev, user) });
}

/* ---------- lab: حسابي / المستخدمين / بيانات المعمل ---------- */
async function labMe(env, me) {
  const user = await env.DATA.get(`lu:${me.id}:${me.u}`, 'json');
  return json({ lab: await labInfo(env, me.dev, user) });
}

async function updateMe(req, env, me) {
  const b = await readJson(req);
  const lockKey = `lab:${me.s}:${me.u}`;
  if (await isLocked(env, lockKey)) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  const user = await env.DATA.get(`lu:${me.id}:${me.u}`, 'json');
  if (!safeEq(await hashPw(String(b.current || ''), user.salt), user.hash)) {
    await addFail(env, lockKey);
    return fail('كلمة السر الحالية غلط', 403);
  }
  const newName = b.username ? clean(b.username, 30).toLowerCase() : user.username;
  const newPw = String(b.password || '');
  if (!USERNAME_RE.test(newName)) return fail('اسم المستخدم 3-30 حرف إنجليزي أو أرقام أو _ . -');
  if (newPw && newPw.length < MIN_PW) return fail(`كلمة السر لازم تكون ${MIN_PW} أحرف على الأقل`);
  if (newName !== user.username && (await env.DATA.get(`lu:${me.id}:${newName}`))) return fail('اسم المستخدم ده موجود', 409);
  if (newName === user.username && !newPw) return fail('مفيش تغيير');
  const updated = { ...user, username: newName };
  if (newPw) {
    updated.salt = newSalt();
    updated.hash = await hashPw(newPw, updated.salt);
    updated.defaultPw = false;
  }
  await putUser(env, me.id, updated);
  if (newName !== user.username) await env.DATA.delete(`lu:${me.id}:${user.username}`);
  await clearFail(env, lockKey);
  return json({ token: await signLabToken(env, me.dev, newName), lab: await labInfo(env, me.dev, updated) });
}

async function updateLabInfo(req, env, me) {
  const b = await readJson(req);
  const labName = clean(b.labName);
  const branch = clean(b.branch, 60);
  if (!labName || !branch) return fail('اكتب اسم المعمل ورقم الفرع');
  let logo;
  if (b.logo !== undefined) {
    const l = parseLogo(b.logo);
    if (l.error) return fail(l.error);
    logo = l.value;
  }
  const dev = { ...me.dev, labName, branch, address: clean(b.address, 250) };
  await env.DATA.put('dev:' + dev.serial, JSON.stringify(dev));
  await saveBrand(env, dev, logo);
  const user = await env.DATA.get(`lu:${me.id}:${me.u}`, 'json');
  return json({ lab: await labInfo(env, dev, user) });
}

async function listUsers(env, me) {
  const list = (await listAll(env, `lu:${me.id}:`)).map((k) => k.metadata).filter(Boolean);
  list.sort((a, b) => a.username.localeCompare(b.username));
  return json({ users: list });
}

async function addUser(req, env, me) {
  const b = await readJson(req);
  const username = clean(b.username, 30).toLowerCase();
  const password = String(b.password || '');
  const role = b.role === 'admin' ? 'admin' : 'staff';
  if (!USERNAME_RE.test(username)) return fail('اسم المستخدم 3-30 حرف إنجليزي أو أرقام أو _ . -');
  if (password.length < MIN_PW) return fail(`كلمة السر لازم تكون ${MIN_PW} أحرف على الأقل`);
  if (await env.DATA.get(`lu:${me.id}:${username}`)) return fail('اسم المستخدم ده موجود', 409);
  await putUser(env, me.id, await makeUser(username, password, role));
  return json({ ok: true });
}

async function userAction(req, env, me, username, action) {
  const user = await env.DATA.get(`lu:${me.id}:${username}`, 'json');
  if (!user) return fail('المستخدم غير موجود', 404);
  if (action === 'delete') {
    if (username === me.u) return fail('مينفعش تحذف المستخدم اللي إنت داخل بيه');
    if (user.role === 'admin' && (await adminCount(env, me.id)) <= 1) return fail('لازم يفضل مدير واحد على الأقل');
    await env.DATA.delete(`lu:${me.id}:${username}`);
    return json({ ok: true });
  }
  const b = await readJson(req);
  if (action === 'password') {
    const pw = String(b.password || '');
    if (pw.length < MIN_PW) return fail(`كلمة السر لازم تكون ${MIN_PW} أحرف على الأقل`);
    user.salt = newSalt();
    user.hash = await hashPw(pw, user.salt);
    user.defaultPw = false;
    await putUser(env, me.id, user);
    await clearFail(env, `lab:${me.s}:${username}`);
    return json({ ok: true });
  }
  if (action === 'role') {
    const role = b.role === 'admin' ? 'admin' : 'staff';
    if (user.role === 'admin' && role !== 'admin' && (await adminCount(env, me.id)) <= 1) return fail('لازم يفضل مدير واحد على الأقل');
    user.role = role;
    await putUser(env, me.id, user);
    return json({ ok: true });
  }
  return fail('غير موجود', 404);
}

/* ---------- admin: الأجهزة وأكواد التفعيل (إنت بس) ---------- */
async function deviceOut(env, d) {
  const brand = await getBrand(env, d.labId, d);
  return { ...d, code: await activationCode(env, d.serial), logo: brand.logo || '' };
}

async function adminApi(req, env, pathname) {
  if (!env.ADMIN_KEY) return fail('ADMIN_KEY غير مضبوط على السيرفر', 500);
  const lock = 'adm:' + clientIp(req);
  if (await isLocked(env, lock)) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  if (!safeEq(req.headers.get('X-Admin-Key') || '', env.ADMIN_KEY)) {
    await addFail(env, lock);
    return fail('غير مسموح', 403);
  }
  const m = req.method;
  let r;
  if (pathname === '/api/admin/devices' && m === 'GET') {
    const out = [];
    for (const k of await listAll(env, 'dev:')) {
      const d = await env.DATA.get(k.name, 'json');
      if (d) out.push(await deviceOut(env, d));
    }
    out.sort((a, b) => b.created - a.created);
    return json({ devices: out });
  }
  if (pathname === '/api/admin/devices' && m === 'POST') {
    const b = await readJson(req);
    const serial = normSerial(b.serial);
    const labName = clean(b.labName);
    const branch = clean(b.branch, 60);
    if (!serial) return fail('رقم الجهاز لازم يكون 16 خانة (حروف وأرقام A-F و 0-9)');
    if (!labName || !branch) return fail('اكتب اسم المعمل ورقم الفرع');
    if (await getDevice(env, serial)) return fail('الجهاز ده مسجّل قبل كده', 409);
    const dev = { serial, labId: crypto.randomUUID(), labName, branch, address: clean(b.address, 250), blocked: false, activatedAt: null, created: Date.now() };
    await env.DATA.put('dev:' + serial, JSON.stringify(dev));
    await saveBrand(env, dev, '');
    await putUser(env, dev.labId, await makeUser(DEFAULT_ADMIN.username, DEFAULT_ADMIN.password, 'admin', true));
    return json(await deviceOut(env, dev));
  }
  if ((r = pathname.match(/^\/api\/admin\/devices\/([0-9A-F-]{19})(?:\/(block|unblock|reset-admin|move))?$/))) {
    const serial = normSerial(r[1]);
    const dev = serial ? await getDevice(env, serial) : null;
    if (!dev) return fail('الجهاز غير موجود', 404);
    if (m === 'POST' && !r[2]) {
      const b = await readJson(req);
      if (b.labName !== undefined) dev.labName = clean(b.labName) || dev.labName;
      if (b.branch !== undefined) dev.branch = clean(b.branch, 60) || dev.branch;
      if (b.address !== undefined) dev.address = clean(b.address, 250);
      let logo;
      if (b.logo !== undefined) {
        const l = parseLogo(b.logo);
        if (l.error) return fail(l.error);
        logo = l.value;
      }
      await saveBrand(env, dev, logo);
    } else if (m === 'POST' && (r[2] === 'block' || r[2] === 'unblock')) {
      dev.blocked = r[2] === 'block';
    } else if (m === 'POST' && r[2] === 'move') {
      // نقل المعمل لسيريال جديد (لو الهارد أو اللوحة الأم اتغيّرت): نفس البيانات والمستخدمين، ويحتاج تفعيل بالكود الجديد
      const newSerial = normSerial((await readJson(req)).newSerial);
      if (!newSerial) return fail('السيريال الجديد لازم يكون 16 خانة');
      if (newSerial === serial) return fail('ده نفس السيريال الحالي');
      if (await getDevice(env, newSerial)) return fail('السيريال الجديد مسجّل قبل كده', 409);
      const moved = { ...dev, serial: newSerial, activatedAt: null, blocked: false };
      await env.DATA.put('dev:' + newSerial, JSON.stringify(moved));
      await env.DATA.delete('dev:' + serial);
      return json(await deviceOut(env, moved));
    } else if (m === 'POST' && r[2] === 'reset-admin') {
      // لو المعمل نسي باسورد المدير: يرجع admin / 1234
      await putUser(env, dev.labId, await makeUser(DEFAULT_ADMIN.username, DEFAULT_ADMIN.password, 'admin', true));
      await clearFail(env, `lab:${serial}:${DEFAULT_ADMIN.username}`);
      return json(await deviceOut(env, dev));
    } else return fail('غير موجود', 404);
    await env.DATA.put('dev:' + serial, JSON.stringify(dev));
    return json(await deviceOut(env, dev));
  }
  return fail('غير موجود', 404);
}

async function createPatient(req, env, me) {
  const b = await readJson(req);
  const name = clean(b.name, 100);
  if (!name) return fail('اكتب اسم المريض');
  let code = '';
  for (let i = 0; i < 30; i++) {
    const c = randomCode();
    if (!(await env.DATA.get('patient:' + c))) {
      code = c;
      break;
    }
  }
  if (!code) return fail('تعذر إنشاء كود، حاول تاني', 500);
  const password = randomPassword();
  const salt = newSalt();
  const created = Date.now();
  await env.DATA.put('patient:' + code, JSON.stringify({ code, labId: me.id, name, salt, hash: await hashPw(password, salt), created }));
  await env.DATA.put(`lp:${me.id}:${code}`, '1', { metadata: { code, name, created } });
  return json({ code, password, name });
}

async function listPatients(env, me) {
  const keys = await listAll(env, `lp:${me.id}:`);
  const list = keys.map((k) => k.metadata).filter(Boolean);
  list.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  return json({ patients: list });
}

async function resetPatientPw(env, me, code) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  const password = randomPassword();
  p.salt = newSalt();
  p.hash = await hashPw(password, p.salt);
  p.lv = (p.lv || 0) + 1; // كلمة سر جديدة = بتلغي كل روابط الدخول والجلسات القديمة
  await env.DATA.put('patient:' + code, JSON.stringify(p));
  await clearFail(env, 'patient:' + code);
  return json({ code, password, name: p.name });
}

async function deletePatient(env, me, code) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  for (const k of await listAll(env, `res:${code}:`)) {
    await env.DATA.delete(`file:${code}:${k.metadata?.id}`);
    await env.DATA.delete(k.name);
  }
  await env.DATA.delete('patient:' + code);
  await env.DATA.delete(`lp:${me.id}:${code}`);
  return json({ ok: true });
}

async function listResults(env, code) {
  const keys = await listAll(env, `res:${code}:`);
  const list = keys.map((k) => k.metadata).filter(Boolean);
  list.sort((a, b) => b.date - a.date);
  return list;
}

async function uploadResult(req, env, me, code) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  let form;
  try {
    form = await req.formData();
  } catch {
    return fail('الملف غير صالح');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail('اختار ملف PDF');
  if (file.size > MAX_PDF) return fail('حجم الملف أكبر من 20 ميجا');
  const buf = await file.arrayBuffer();
  if (dec.decode(new Uint8Array(buf, 0, Math.min(5, buf.byteLength))) !== '%PDF-') return fail('الملف لازم يكون PDF');
  const id = crypto.randomUUID();
  const name = clean(form.get('name') || file.name || 'نتيجة', 100).replace(/\.pdf$/i, '');
  const meta = { id, name, size: buf.byteLength, date: Date.now() };
  await env.DATA.put(`file:${code}:${id}`, buf);
  await env.DATA.put(`res:${code}:${id}`, '1', { metadata: meta });
  return json(meta);
}

async function deleteResult(env, me, code, id) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  await env.DATA.delete(`file:${code}:${id}`);
  await env.DATA.delete(`res:${code}:${id}`);
  return json({ ok: true });
}

async function patientLogin(req, env) {
  const b = await readJson(req);
  const code = clean(b.code, 6).replace(/\D/g, '');
  const ip = clientIp(req);
  const ipKey = 'pip:' + ip;
  const lockKey = `patient:${code}:${ip}`; // القفل لكل (كود + IP) فحد غريب مايقدرش يقفل حساب المريض الحقيقي
  if ((await isLocked(env, lockKey)) || (await isLocked(env, ipKey, MAX_IP_FAILS))) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  const pw = normPw(b.password);
  const p = code ? await env.DATA.get('patient:' + code, 'json') : null;
  const ok = p && pw && safeEq(await hashPw(pw, p.salt), p.hash);
  if (!ok) {
    if (code) await addFail(env, lockKey);
    await addFail(env, ipKey);
    return fail('الكود أو كلمة السر غلط', 401);
  }
  await clearFail(env, lockKey);
  const token = await signToken(env, { role: 'patient', id: code, v: p.lv || 0, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL });
  return json({ token, name: p.name, code });
}

/* ---------- رابط الدخول المباشر للمريض (من غير كود ولا كلمة سر) ---------- */
// الرابط توقيع HMAC مش مخزّن في أي مكان، وبيتلغي بزيادة lv (كلمة سر جديدة أو إلغاء الروابط)
async function createLink(env, me, code) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
  return json({ token: await signToken(env, { role: 'plink', id: code, v: p.lv || 0, exp }), exp });
}
async function revokeLinks(env, me, code) {
  const p = await getOwnedPatient(env, me.id, code);
  if (!p) return fail('المريض غير موجود', 404);
  p.lv = (p.lv || 0) + 1;
  await env.DATA.put('patient:' + code, JSON.stringify(p));
  return json({ ok: true });
}
async function linkLogin(req, env) {
  const b = await readJson(req);
  const ipKey = 'pip:' + clientIp(req);
  if (await isLocked(env, ipKey, MAX_IP_FAILS)) return fail('محاولات كتير غلط، استنى 15 دقيقة', 429);
  const t = typeof b.token === 'string' && b.token.length < 600 ? await verifyToken(env, b.token) : null;
  const pt = t && t.role === 'plink' ? await env.DATA.get('patient:' + t.id, 'json') : null;
  if (!pt || (pt.lv || 0) !== (t.v || 0)) {
    await addFail(env, ipKey);
    return fail('الرابط ده انتهت صلاحيته أو اتلغى، اطلب رابط جديد من المعمل', 401);
  }
  const token = await signToken(env, { role: 'patient', id: pt.code, v: pt.lv || 0, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL });
  return json({ token, name: pt.name, code: pt.code });
}

async function serveFile(env, p, code, id) {
  if (p.role === 'patient' ? p.id !== code : !(await getOwnedPatient(env, p.id, code))) return fail('غير مسموح', 403);
  if (p.role === 'patient') {
    const pt = await env.DATA.get('patient:' + code, 'json');
    if (!pt || (pt.lv || 0) !== (p.v || 0)) return fail('سجّل الدخول', 401);
  }
  const buf = await env.DATA.get(`file:${code}:${id}`, 'arrayBuffer');
  if (!buf) return fail('الملف غير موجود', 404);
  return new Response(buf, {
    headers: { ...CORS, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' },
  });
}

/* ---------- router ---------- */
export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.SECRET) return fail('SECRET غير مضبوط على السيرفر', 500);
    const { pathname } = new URL(req.url);
    const m = req.method;
    let r;
    try {
      if (pathname.startsWith('/api/admin/')) return await adminApi(req, env, pathname);
      if (pathname === '/api/device/status' && m === 'GET') return await deviceStatus(req, env);
      if (pathname === '/api/device/activate' && m === 'POST') return await deviceActivate(req, env);
      if (pathname === '/api/lab/login' && m === 'POST') return await labLogin(req, env);
      if (pathname === '/api/patient/login' && m === 'POST') return await patientLogin(req, env);
      if (pathname === '/api/patient/link-login' && m === 'POST') return await linkLogin(req, env);

      if (pathname === '/api/patient/results' && m === 'GET') {
        const p = await auth(req, env, 'patient');
        if (!p) return fail('سجّل الدخول', 401);
        const pt = await env.DATA.get('patient:' + p.id, 'json');
        if (!pt || (pt.lv || 0) !== (p.v || 0)) return fail('الحساب غير موجود', 401);
        const brand = await getBrand(env, pt.labId);
        return json({ name: pt.name, code: p.id, lab: { name: brand.labName || '', logo: brand.logo || '' }, results: await listResults(env, p.id) });
      }

      if ((r = pathname.match(/^\/api\/files\/(\d{4,6})\/([\w-]+)$/)) && m === 'GET') {
        const p = await auth(req, env);
        if (!p) return fail('سجّل الدخول', 401);
        return await serveFile(env, p, r[1], r[2]);
      }

      if (pathname.startsWith('/api/lab/')) {
        const me = await auth(req, env, 'lab');
        if (!me) return fail('سجّل الدخول', 401);
        const adminOnly = () => (me.adm ? null : fail('الصلاحية دي للمدير بس', 403));
        let g;
        if (pathname === '/api/lab/me' && m === 'GET') return await labMe(env, me);
        if (pathname === '/api/lab/me' && m === 'POST') return await updateMe(req, env, me);
        if (pathname === '/api/lab/info' && m === 'POST') return adminOnly() || (await updateLabInfo(req, env, me));
        if (pathname === '/api/lab/users' && m === 'GET') return adminOnly() || (await listUsers(env, me));
        if (pathname === '/api/lab/users' && m === 'POST') return adminOnly() || (await addUser(req, env, me));
        if ((g = pathname.match(/^\/api\/lab\/users\/([a-z0-9_.\-]{3,30})(?:\/(password|role))?$/))) {
          if (m === 'DELETE' && !g[2]) return adminOnly() || (await userAction(req, env, me, g[1], 'delete'));
          if (m === 'POST' && g[2]) return adminOnly() || (await userAction(req, env, me, g[1], g[2]));
        }

        if (pathname === '/api/lab/patients' && m === 'GET') return await listPatients(env, me);
        if (pathname === '/api/lab/patients' && m === 'POST') return await createPatient(req, env, me);
        if ((r = pathname.match(/^\/api\/lab\/patients\/(\d{4,6})$/)) && m === 'DELETE') return await deletePatient(env, me, r[1]);
        if ((r = pathname.match(/^\/api\/lab\/patients\/(\d{4,6})\/reset$/)) && m === 'POST') return await resetPatientPw(env, me, r[1]);
        if ((r = pathname.match(/^\/api\/lab\/patients\/(\d{4,6})\/link$/))) {
          if (m === 'POST') return await createLink(env, me, r[1]);
          if (m === 'DELETE') return await revokeLinks(env, me, r[1]);
        }
        if ((r = pathname.match(/^\/api\/lab\/patients\/(\d{4,6})\/results$/))) {
          if (m === 'GET') {
            if (!(await getOwnedPatient(env, me.id, r[1]))) return fail('المريض غير موجود', 404);
            return json({ results: await listResults(env, r[1]) });
          }
          if (m === 'POST') return await uploadResult(req, env, me, r[1]);
        }
        if ((r = pathname.match(/^\/api\/lab\/patients\/(\d{4,6})\/results\/([\w-]+)$/)) && m === 'DELETE')
          return await deleteResult(env, me, r[1], r[2]);
      }
      return fail('غير موجود', 404);
    } catch (e) {
      return fail('خطأ في السيرفر', 500);
    }
  },
};
