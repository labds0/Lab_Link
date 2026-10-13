// مراقبة فولدر النتايج: بتكتشف ملفات PDF الجديدة، وبتستنى لحد ما الملف يخلّص نسخ، وبتنقله بعد الرفع.
// من غير أي اعتماد على Electron عشان تتجرّب لوحدها في Node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_PDF = 20 * 1024 * 1024; // نفس حد السيرفر
const DONE_DIR = '_uploaded'; // الملفات اللي اترفعت
const SKIP_DIR = '_ignored'; // الملفات اللي المعمل قرر يتجاهلها

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isPdfName = (n) => /\.pdf$/i.test(n) && !n.startsWith('.') && !n.startsWith('~');

function createWatcher({ onFound = () => {}, onGone = () => {}, stableMs = 2000, scanMs = 30000 } = {}) {
  const fsp = fs.promises;
  let dir = '';
  let watcher = null;
  let scanTimer = null;
  let gen = 0; // بيزيد مع كل start/stop عشان أي فحص قديم يبطّل لما الفولدر يتغيّر
  const items = new Map(); // id -> { id, name, path, size }
  const byName = new Map(); // name -> id
  const checking = new Set();

  function forget(id) {
    const it = items.get(id);
    if (!it) return null;
    items.delete(id);
    byName.delete(it.name);
    return it;
  }

  async function check(name) {
    if (!dir || !isPdfName(name) || checking.has(name) || byName.has(name)) return;
    const myGen = gen;
    const full = path.join(dir, name);
    checking.add(name);
    try {
      let st = await fsp.stat(full);
      if (!st.isFile()) return;
      let stable = false;
      for (let i = 0; i < 40 && !stable; i++) {
        await sleep(stableMs);
        if (myGen !== gen) return;
        const st2 = await fsp.stat(full); // لو اتمسح هيرمي خطأ وبنخرج
        stable = st2.size === st.size && st2.mtimeMs === st.mtimeMs && st2.size > 0;
        st = st2;
      }
      if (!stable) return; // لسه بيتكتب، الفحص الدوري هيرجع له
      await (await fsp.open(full, 'r')).close(); // لو مقفول من برنامج تاني ده هيفشل
      if (myGen !== gen || byName.has(name)) return;
      const id = crypto.randomUUID();
      items.set(id, { id, name, path: full, size: st.size });
      byName.set(name, id);
      onFound({ id, name, size: st.size });
    } catch {
      /* اتمسح أو مقفول: هنحاول تاني في الفحص الدوري */
    } finally {
      checking.delete(name);
    }
  }

  async function scan() {
    if (!dir) return;
    const myGen = gen;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    if (myGen !== gen) return;
    const present = new Set(entries.filter((e) => e.isFile()).map((e) => e.name));
    for (const it of [...items.values()]) {
      if (!present.has(it.name)) { forget(it.id); onGone({ id: it.id }); } // اتمسح أو اتنقل بره البرنامج
    }
    for (const n of present) check(n);
  }

  function stop() {
    gen++;
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    for (const it of [...items.values()]) onGone({ id: it.id });
    items.clear(); byName.clear(); checking.clear();
    dir = '';
  }

  function start(newDir) {
    stop();
    if (!newDir) return false;
    dir = path.resolve(newDir);
    try { if (!fs.statSync(dir).isDirectory()) throw new Error('not a dir'); } catch { dir = ''; return false; }
    try {
      watcher = fs.watch(dir, (_ev, name) => { if (name) check(String(name)); else scan(); });
      watcher.on('error', () => {});
    } catch { /* فولدر شبكة مثلًا: الفحص الدوري كفاية */ }
    scanTimer = setInterval(scan, scanMs);
    if (scanTimer.unref) scanTimer.unref();
    scan();
    return true;
  }

  const list = () => [...items.values()].map(({ id, name, size }) => ({ id, name, size }));

  // الواجهة بتتعامل بـ id بس، ومش بتبعت مسارات: عشان ما تقدرش تقرا ملفات من برّه الفولدر ده
  function resolve(id) {
    const it = items.get(id);
    if (!it) throw new Error('الملف ده مبقاش موجود في الفولدر');
    if (path.dirname(path.resolve(it.path)) !== dir) throw new Error('مسار غير مسموح');
    return it;
  }

  async function read(id) {
    const it = resolve(id);
    const st = await fsp.stat(it.path);
    if (st.size > MAX_PDF) throw new Error('حجم الملف أكبر من 20 ميجا');
    const buf = await fsp.readFile(it.path);
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('الملف ده مش PDF صالح');
    return buf;
  }

  async function move(id, sub) {
    const it = resolve(id);
    const targetDir = path.join(dir, sub);
    await fsp.mkdir(targetDir, { recursive: true });
    let target = path.join(targetDir, it.name);
    try { await fsp.access(target); const e = path.extname(it.name); target = path.join(targetDir, `${path.basename(it.name, e)}-${Date.now()}${e}`); } catch {}
    try { await fsp.rename(it.path, target); }
    catch { await fsp.copyFile(it.path, target); await fsp.unlink(it.path); }
    forget(id);
    return target;
  }

  return { start, stop, scan, list, read, done: (id) => move(id, DONE_DIR), skip: (id) => move(id, SKIP_DIR), MAX_PDF, DONE_DIR, SKIP_DIR };
}

module.exports = { createWatcher, isPdfName, MAX_PDF, DONE_DIR, SKIP_DIR };
