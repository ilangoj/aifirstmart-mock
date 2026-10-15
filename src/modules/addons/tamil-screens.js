/* AIFirstMart mock: Tamil for the newer screens (refunds, customer shop and plans, catalogue editor, channels,
 * customer sign-in, access policy, training records, price tools) and the role workspaces.
 * The platform already translates its original screens word by word. This layer runs first and translates whole
 * sentences from a dictionary (window.AFM_TA_UI, built from tamil/*.py). Numbers, amounts, codes and product names
 * inside a sentence are kept and put back in place, so one entry covers every variant. Text joined with " · " is
 * translated part by part. Nothing changes in English. */
(() => {
'use strict';
if (window.__afmTamil) return; window.__afmTamil = true;
const D = window.AFM_TA_UI || {exact: {}, tmpl: {}, parts: {}, names: {}, attrs: {}};
const isTa = () => { try { return lang === 'ta'; } catch (e) { return false; } };
const PRODUCTS = (() => { try { return productTranslations; } catch (e) { return {}; } })();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PROD_RE = Object.keys(PRODUCTS).length ? new RegExp(Object.keys(PRODUCTS).sort((a, b) => b.length - a.length).map(esc).join('|'), 'g') : null;
const DAYS = {Sun: 'ஞாயி.', Mon: 'திங்.', Tue: 'செவ்.', Wed: 'புத.', Thu: 'வியா.', Fri: 'வெள்.', Sat: 'சனி'};
const MONTHS = {Jan: 'ஜன.', Feb: 'பிப்.', Mar: 'மார்.', Apr: 'ஏப்.', May: 'மே', Jun: 'ஜூன்', Jul: 'ஜூலை', Aug: 'ஆக.', Sep: 'செப்.', Sept: 'செப்.', Oct: 'அக்.', Nov: 'நவ.', Dec: 'டிச.'};
const DATE_RE = /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/g;
// Tokens, replaced in the same order as tamil/build_ta_data.py made the dictionary keys.
const STAGES = [
  ['§', DATE_RE, m => { const x = /(\w+), (\d+) (\w+)/.exec(m); return `${DAYS[x[1]]}, ${x[2]} ${MONTHS[x[3]]}`; }],
  ['%p', PROD_RE, m => PRODUCTS[m]?.ta || m],
  ['@', /\b[A-Z]{2,5}(?:-[A-Z0-9]+)*-\d[\w-]*\b/g, m => m],
  ['@', /[\w.+-]+@[\w-]+\.[\w.]+/g, m => m],
  ['₹#', /₹\s?[\d,]+(?:\.\d+)?/g, m => m],
  ['#', /(?<![\w#\u0001])\d[\d,]*(?:\.\d+)?/g, m => m],
];
const CHANNELS = {'Facebook and Instagram': 'பேஸ்புக் மற்றும் இன்ஸ்டாகிராம்', 'WhatsApp': 'வாட்ஸ்அப்', 'Flipkart': 'பிளிப்கார்ட்', 'Amazon': 'அமேசான்', 'ONDC': 'ஓஎன்டிசி', 'Mobile app': 'மொபைல் செயலி', 'Web shop': 'இணையக் கடை'};
const CHAN_STAGE = ['%c', new RegExp(Object.keys(CHANNELS).map(esc).join('|'), 'g'), m => CHANNELS[m] || m];
function skeleton(t, withChannels) {
  const toks = []; let s = t;
  for (const [mark, re, render] of (withChannels ? [STAGES[0], STAGES[1], CHAN_STAGE, ...STAGES.slice(2)] : STAGES)) {
    if (!re) continue;
    s = s.replace(re, m => { toks.push({mark, out: render(m)}); return '\u0001' + String.fromCharCode(0xE000 + toks.length - 1) + '\u0001'; });
  }
  const order = []; const key = s.replace(/\u0001(.)\u0001/g, (_, c) => { const tk = toks[c.charCodeAt(0) - 0xE000]; order.push(tk); return tk.mark; });
  return {key, order};
}
function fill(ta, order) {
  if (/\{\d\}/.test(ta)) return ta.replace(/\{(\d)\}/g, (_, n) => order[n - 1]?.out ?? '');
  let i = 0; return ta.replace(/%p|%c|₹#|§|@|#/g, m => (order[i] ? order[i++].out : m));
}
// The platform translates word by word as soon as text appears, so text drawn before this layer loaded can read
// "சரக்கு overview". Each dictionary entry is also registered under the forms that replacer produces.
const ALIAS = {}, ALIAS_T = {};
(() => {
  let T0 = null, D0 = null; try { T0 = tamilizeString; } catch (e) {} try { D0 = deepTamilText; } catch (e) {}
  const forms = k => { const out = new Set(); try { if (T0) out.add(T0(k)); if (D0) out.add(D0(k)); if (T0 && D0) { out.add(D0(T0(k))); out.add(T0(D0(k))); } } catch (e) {} out.delete(k); return out; };
  for (const k of [...Object.keys(D.exact), ...Object.keys(D.parts)]) for (const f of forms(k)) if (!(f in D.exact)) ALIAS[f] = k;
  for (const k of Object.keys(D.tmpl)) for (const f of forms(k)) if (!(f in D.tmpl)) ALIAS_T[f] = k;
})();
const NAME_RE = Object.keys(D.names).length ? new RegExp('^(?:' + Object.keys(D.names).map(esc).join('|') + ')(?: (?:S|Demo))?$') : null;
function one(t) {
  if (D.exact[t] != null) return D.exact[t];
  if (D.parts[t] != null) return D.parts[t];
  if (ALIAS[t] != null) return D.exact[ALIAS[t]] ?? D.parts[ALIAS[t]];
  if (NAME_RE && NAME_RE.test(t)) return t.split(' ').map(w => D.names[w] || (w === 'S' ? 'எஸ்' : w === 'Demo' ? '(பயிற்சி)' : w)).join(' ');
  const {key, order} = skeleton(t);
  if (D.tmpl[key] != null) return fill(D.tmpl[key], order);
  if (ALIAS_T[key] != null) return fill(D.tmpl[ALIAS_T[key]], order);
  const c = skeleton(t, true); if (c.key !== key && D.tmpl[c.key] != null) return fill(D.tmpl[c.key], c.order);
  if (order.length && key.replace(/§|%p|₹#|@|#/g, '').trim().replace(/[\s,·:/×x()+\-–→.]/g, '') === '') return fill(key, order);  // only data: dates, products, codes
  return null;
}
// Sentences built around a role or screen name that is already in Tamil.
const PATTERNS = [
  [/^(.+) granted until (.+)$/, (m, r, d) => `${one(r) ?? r} பங்கு ${d} வரை வழங்கப்பட்டது`],
  [/^(.+): use a JPG, PNG or WebP image$/, '$1: ஜேபிஜி, பிஎன்ஜி அல்லது வெப்பி படத்தைப் பயன்படுத்துங்கள்'], [/^(.+): larger than 5 MB$/, '$1: 5 எம்பி-க்கு மேல் பெரியது'],
  [/^(.+): the image could not be read$/, '$1: படத்தைப் படிக்க முடியவில்லை'],
  [/^(.+): (\d+) × (\d+) pixels is too small; use at least 500 × 500$/, '$1: $2 × $3 பிக்சல் மிகச் சிறியது; குறைந்தது 500 × 500 பயன்படுத்துங்கள்'],[/^([\u0B80-\u0BFF][^A-Za-z]*) only$/, '$1 மட்டும்'], [/^([\u0B80-\u0BFF][^A-Za-z]*) only \((you)\)$/, '$1 மட்டும் (நீங்கள்)']];
function tr(value) {
  if (value == null) return value;
  const s = String(value), t = s.trim(); if (!t || !/[A-Za-z]/.test(t)) return value;
  let out = one(t);
  if (out == null) for (const [re, rep] of PATTERNS) if (re.test(t)) { out = t.replace(re, rep); break; }
  if (out == null && t.includes(' · ')) {                       // "Cashier · Ulundurpet · POS-01"
    const lead = t.startsWith('· ') ? '· ' : '', parts = t.slice(lead.length).split(' · '), got = parts.map(p => one(p) ?? (/[A-Za-z]{3,}/.test(p) && !/^[A-Z0-9][\w.-]*$/.test(p) && !NAME_RE?.test(p) ? null : p));
    if (got.every(x => x != null)) out = lead + got.join(' · ');
  }
  if (out == null && t.includes(' / ')) { const parts = t.split(' / ').map(p => one(p) ?? (NAME_RE?.test(p) ? p : null)); if (parts.every(x => x != null)) out = parts.join(' / '); }
  return out == null ? value : s.replace(t, out);
}
// Run before the platform's word-by-word replacers, which leave sentences half in English.
try { const base = tamilizeString; tamilizeString = function (v) { if (isTa()) { const r = tr(v); if (r !== v) return r; } return base.apply(this, arguments); }; } catch (e) {}
try { const base = deepTamilText; deepTamilText = function (v) { if (isTa()) { const r = tr(v); if (r !== v) return r; } return base.apply(this, arguments); }; } catch (e) {}
function translateTree(root) {
  if (!isTa() || !root) return;
  const w = document.createTreeWalker(root.nodeType === 1 ? root : root.parentNode || document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (n.parentElement?.closest('script,style,code,.schema')) continue; const v = tr(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
  const host = root.nodeType === 1 ? root : document.body;
  host.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(el => {
    for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (!v) continue; const t = D.attrs[v] ?? tr(v); if (t !== v) el.setAttribute(a, t); }
  });
}
let queued = new Set(), timer = null;
new MutationObserver(rs => {
  if (!isTa()) return;
  for (const r of rs) for (const n of r.addedNodes) queued.add(n.nodeType === 1 ? n : n.parentNode);
  if (!timer) timer = requestAnimationFrame(() => { timer = null; const list = [...queued]; queued.clear(); list.forEach(n => n && n.isConnected && translateTree(n)); });
}).observe(document.body, {childList: true, subtree: true});
// Re-draw the newer screens when the language changes, so they come back in the chosen language.
function redraw() {
  try { window.AFMPhase2?.renderRefunds(); window.AFMPhase2?.renderShop(); window.AFMPhase2?.renderRecords(); } catch (e) {}
  try { window.AFMCatalogue?.render(); } catch (e) {}
  try { window.AFMPolicy?.render(); } catch (e) {}
  try { window.AFMChannels?.render?.(); } catch (e) {}
  if (isTa()) translateTree(document.body);
}
document.querySelector('#language')?.addEventListener('change', () => setTimeout(redraw, 60));
// Safety pass: anything drawn by changing existing text (not adding nodes) is caught within a moment.
setInterval(() => { if (!isTa() || document.hidden) return; for (const el of document.querySelectorAll('.screen.active, #overlay.show, #toast, .top')) translateTree(el); }, 1500);
if (isTa()) setTimeout(() => translateTree(document.body), 0);
// Keep each window's English title beside the shown one, so lesson checks work in either language.
try { const baseOpen = open; open = function (title) { const r = baseOpen.apply(this, arguments); const el = document.querySelector('#modalTitle'); if (el) el.dataset.en = String(title ?? '').replace(/<[^>]+>/g, '').trim(); return r; }; } catch (e) {}
window.AFMTamil = {tr, translateTree, redraw, size: () => Object.keys(D.exact).length + Object.keys(D.tmpl).length};
})();
