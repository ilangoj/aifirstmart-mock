// ================================================================ toasts that can be read and stay long enough
function launchLabel() { const l = q('#gt-launch'); if (l && !l.getAttribute('aria-label')) l.setAttribute('aria-label', 'Guided training'); }
function betterToasts() {
  const t = q('#toast'); if (!t || t.dataset.afm) return;
  t.dataset.afm = '1'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
  try {
    const base = toast;
    toast = function (msg) {
      if (/workspace loaded$/.test(String(msg))) return;          // the header already shows the role; this only covered the page
      const r = base.apply(this, arguments);
      const important = /^(Refused|Blocked|Enter|Choose|Fill|Only|Your role|This|The |Express|Not enough|A product|Too many)/.test(String(msg));
      t.setAttribute('role', important ? 'alert' : 'status');
      if (important) { clearTimeout(t._hold); t.classList.add('show'); t._hold = setTimeout(() => t.classList.remove('show'), 6000); }
      return r;
    };
  } catch (e) {}
}

