// الوضع الليلي: تلقائي حسب النظام، ويتخزن اختيار المستخدم لو غيّره بإيده
(function () {
  var KEY = 'theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) {
    var dark = t === 'dark' || (t !== 'light' && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', dark ? '#0a1216' : '#f3f6f9');
    document.dispatchEvent(new CustomEvent('themechange', { detail: dark ? 'dark' : 'light' }));
  }
  apply(saved());
  if (mq.addEventListener) mq.addEventListener('change', function () { if (!saved()) apply(null); });
  window.toggleTheme = function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next);
    return next;
  };
})();
