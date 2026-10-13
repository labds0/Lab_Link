// دوال مساعدة بسيطة من غير أي اعتماد على المتصفح أو Electron (بتتجرّب لوحدها في Node).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LabUtil = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const toAscii = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

  /* ---------- رقم التليفون ---------- */
  // يرجّع الرقم بصيغة دولية من غير + (زي 201012345678) أو '' لو مش صالح. الافتراضي مصر.
  function normalizePhone(raw) {
    let n = toAscii(raw).replace(/\D/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    else if (n.startsWith('0')) n = '20' + n.slice(1);
    return n.length >= 10 && n.length <= 15 ? n : '';
  }

  /* ---------- كلمة سر المريض ---------- */
  const fmtPw = (pw) => {
    const s = String(pw ?? '');
    return /^[A-Z0-9]{8}$/i.test(s) ? s.slice(0, 4) + '-' + s.slice(4) : s;
  };

  /* ---------- رسالة المريض + روابط واتساب وSMS ---------- */
  function shareMessage({ name, labName, url }) {
    return [
      `أهلًا ${name} 👋`,
      `نتيجة تحاليلك من ${labName} جاهزة 🧪`,
      'افتح الرابط لعرضها وتنزيلها:',
      url,
      '(الرابط شخصي، من فضلك ما تشاركوش مع حد)',
    ].join('\n');
  }
  const waUrl = (phone, text) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
  const smsUrl = (phone, text) => `sms:+${normalizePhone(phone)}?body=${encodeURIComponent(text)}`;

  /* ---------- مطابقة اسم الملف بالمريض ---------- */
  // تطبيع للاسم العربي: من غير تشكيل/تطويل، وتوحيد الألف والياء والتاء المربوطة، وأرقام إنجليزي
  function normName(s) {
    return toAscii(s)
      .toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }
  const baseName = (f) => String(f ?? '').replace(/^.*[\\/]/, '').replace(/\.pdf$/i, '');

  // الكود لازم يكون في أول اسم الملف (604913.pdf أو "604913 - CBC.pdf") أو بعد علامة # (CBC #604913).
  // عمدًا مش بندوّر على أي رقم في النص، عشان أرقام زي التاريخ والوقت ما تتطابقش بالغلط مع مريض تاني.
  function extractCode(file) {
    const b = toAscii(baseName(file));
    const m = b.match(/^[\s#\[(]*(\d{4,6})(?!\d)/) || b.match(/#\s*(\d{4,6})(?!\d)/);
    return m ? m[1] : '';
  }

  const NAME_WINDOW_DAYS = 7;
  // يرجّع { patient, how: 'code'|'name' } لو لقى مريض واحد مؤكد، أو { reason } لو لأ
  function matchFile(file, patients, opts = {}) {
    const { byName = false, now = Date.now() } = opts;
    const code = extractCode(file);
    if (code) {
      const p = patients.find((x) => String(x.code) === code);
      return p ? { patient: p, how: 'code' } : { reason: `مفيش مريض بالكود ${code}` };
    }
    if (!byName) return { reason: 'اسم الملف مفيهوش كود مريض في أوله (مثال: 604913 - CBC.pdf)' };
    const fn = ' ' + normName(baseName(file)) + ' ';
    const since = now - NAME_WINDOW_DAYS * 86400000;
    const hits = patients
      .filter((p) => !p.created || p.created >= since)
      .map((p) => ({ p, n: normName(p.name) }))
      .filter((x) => x.n.split(' ').length >= 2 && fn.includes(' ' + x.n + ' '));
    if (!hits.length) return { reason: `مفيش مريض مسجّل في آخر ${NAME_WINDOW_DAYS} أيام بنفس اسم الملف` };
    const most = Math.max(...hits.map((x) => x.n.split(' ').length));
    const best = hits.filter((x) => x.n.split(' ').length === most);
    if (best.length > 1) return { reason: 'أكتر من مريض بنفس الاسم، اختار المريض بنفسك' };
    return { patient: best[0].p, how: 'name' };
  }

  return { normalizePhone, fmtPw, shareMessage, waUrl, smsUrl, normName, extractCode, matchFile, NAME_WINDOW_DAYS };
});
