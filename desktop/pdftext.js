// قراءة نص أول صفحة من PDF (للتعرف على اسم المريض). لو المكتبة أو الملف فيهم مشكلة بيرجّع [] والملف بيتعلّق ليدوي.
let lib = null;
async function load() {
  if (!lib) lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return lib;
}

async function firstPageTexts(buf, { timeoutMs = 10000, loader = load } = {}) {
  const work = (async () => {
    const pdfjs = await loader();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
    try {
      const tc = await (await doc.getPage(1)).getTextContent();
      return tc.items.map((i) => String(i.str || '').normalize('NFKC')).filter((s) => s.trim()).slice(0, 300);
    } finally { try { await doc.destroy(); } catch {} }
  })();
  const timer = new Promise((r) => { const t = setTimeout(() => r([]), timeoutMs); if (t.unref) t.unref(); });
  try { return await Promise.race([work, timer]); } catch { return []; }
}

module.exports = { firstPageTexts };
