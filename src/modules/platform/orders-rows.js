
/* AIFirstMart mock: every Orders and Logistics record opens as an expandable row with full details,
 * the linked order and its audit activity. Re-applies itself whenever the platform redraws a screen. */
(() => {
'use strict';
if (window.__afmRecords) return; window.__afmRecords = true;
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const open = new Set();          // expanded record keys survive redraws
let filter = 'all';
const ORDER_RE = /AFM-[A-Z]+-\d+/;
const orders = () => { try { return orderData; } catch (e) { return []; } };
const cs = () => { try { return closureState; } catch (e) { return {}; } };
const auditFor = ids => { try { return functionalState.audit.filter(a => ids.some(id => id && `${a.detail} ${a.action}`.includes(id))).slice(0, 5); } catch (e) { return []; } };
const money = v => typeof v === 'number' ? '₹' + v.toLocaleString('en-IN', {minimumFractionDigits: 2}) : v;

function kv(title, pairs) {
  return `<div class="card panel" style="margin:0;min-width:240px;flex:1"><b>${esc(title)}</b><table style="width:100%;margin-top:6px">${pairs.map(([k, v]) =>
    `<tr><td style="color:var(--muted,#57606a);padding:3px 8px 3px 0">${esc(k)}</td><td style="text-align:right;font-weight:600;padding:3px 0">${esc(v)}</td></tr>`).join('')}</table></div>`;
}
function linkedOrder(id) {
  const o = orders().find(x => x.id === id); if (!o) return '';
  return kv(`Linked order · ${o.id}`, [['Customer', o.customer], ['Channel', o.channel], ['Items', o.items], ['Value', money(o.value)], ['Promise', o.promise], ['Payment', o.payment], ['Status', o.status], ['Assigned', o.picker || 'Unassigned']]);
}
function activity(ids) {
  const a = auditFor(ids);
  return `<div class="card panel" style="margin:0;min-width:240px;flex:1"><b>Activity</b>${a.length ? `<table style="width:100%;margin-top:6px">${a.map(x =>
    `<tr><td style="padding:3px 8px 3px 0">${esc(x.time)}</td><td style="padding:3px 0">${esc(x.action)} · ${esc(x.detail)}</td></tr>`).join('')}</table>` : '<p style="margin:6px 0 0">No recorded activity yet.</p>'}</div>`;
}
const detailHtml = (fields, ids, extra = '') =>
  `<div style="display:flex;gap:12px;flex-wrap:wrap;padding:6px 0">${kv('Record', fields)}${ids.order ? linkedOrder(ids.order) : ''}${activity([ids.record, ids.order])}</div>${extra}`;

function toggle(row, key, html, cols) {
  const next = row.nextElementSibling;
  if (next && next.classList.contains('rec-detail')) { next.remove(); open.delete(key); row.setAttribute('aria-expanded', 'false'); row.querySelector('.rec-caret').textContent = '⌄'; return; }
  row.insertAdjacentHTML('afterend', `<tr class="rec-detail"><td colspan="${cols}" style="background:var(--soft,#f3f7f6)">${html}</td></tr>`);
  open.add(key); row.setAttribute('aria-expanded', 'true'); row.querySelector('.rec-caret').textContent = '⌃';
}

// ---------------- Orders tabs: turn every flat table into expandable records
function enhanceOrders() {
  qa('#orders table.table:not([data-records])').forEach(t => {
    t.dataset.records = '1';
    const heads = qa('thead th', t).map(th => th.textContent.trim());
    q('thead tr', t)?.insertAdjacentHTML('beforeend', '<th aria-label="Expand"></th>');
    qa('tbody tr', t).forEach(tr => {
      const cells = qa('td', tr).map(td => td.textContent.trim());
      const record = cells[0], order = (cells.join(' ').match(ORDER_RE) || [])[0];
      tr.dataset.rec = record; tr.classList.add('rec-row'); tr.style.cursor = 'pointer'; tr.setAttribute('aria-expanded', 'false'); tr.tabIndex = 0;
      tr.insertAdjacentHTML('beforeend', '<td class="rec-caret" style="text-align:right">⌄</td>');
      tr._rec = {key: 'o:' + record, cols: heads.length + 1,
        html: () => detailHtml(heads.map((h, i) => [h || 'Action', cells[i]]).filter(([h]) => h !== 'Action'), {record, order})};
      if (open.has(tr._rec.key)) toggle(tr, tr._rec.key, tr._rec.html(), tr._rec.cols);
    });
  });
}

// ---------------- Logistics: a records table for failed deliveries, handoffs, rider collections, transfers
function logisticsRecords() {
  const c = cs(), out = [];
  for (const f of c.failed || []) out.push({type: 'failed', label: 'Failed delivery', id: f.id, ref: f.order, party: `Attempt ${f.attempt}`, status: f.status, order: f.order,
    fields: [['Delivery', f.id], ['Order', f.order], ['Reason', f.reason], ['Attempt', f.attempt], ['Goods', f.stock], ['Status', f.status]], action: ['failedDelivery', 'Open exception']});
  for (const h of c.handoffs || []) { const o = orders().find(x => x.id === shipOrder(h.shipment)); out.push({type: 'handoff', label: 'Dispatch handoff', id: h.id, ref: h.shipment, party: `Picker ${h.picker} · rider ${h.rider}`, status: h.status, order: o?.id,
    fields: [['Handoff', h.id], ['Shipment', h.shipment], ['Bags', h.bags], ['Handling', h.zone], ['Picker', h.picker], ['Rider', h.rider], ['Status', h.status]], action: ['handoff', 'Record handoff']}); }
  for (const r of c.remittances || []) { const e = c.earnings || {}; out.push({type: 'collection', label: 'Rider collection', id: r.id, ref: r.rider, party: `${r.jobs} jobs`, status: r.status,
    fields: [['Remittance', r.id], ['Rider', r.rider], ['Jobs', r.jobs], ['COD expected', money(r.expected)], ['COD declared', money(r.declared)], ['Fees', money(e.fees)], ['Incentive', money(e.incentive)], ['Payable to rider', money(e.payout)], ['Status', r.status]], action: ['riderStatement', 'Rider statement']}); }
  for (const t of c.transfers || []) out.push({type: 'transfer', label: 'Stock transfer', id: t.id, ref: `${t.from} → ${t.to}`, party: `${t.product} × ${t.qty}`, status: t.status,
    fields: [['Transfer', t.id], ['From', t.from], ['To', t.to], ['Product', t.product], ['Quantity', t.qty], ['Status', t.status]], action: null});
  return out;
}
function shipOrder(ship) {
  // Shipments list their order in the Orders > Shipments tab; known mapping in the mock data.
  return {'SHP-10482': 'AFM-APP-2084', 'SHP-10479': 'AFM-WEB-7162'}[ship];
}
const FILTERS = [['all', 'All'], ['failed', 'Failed deliveries'], ['handoff', 'Dispatch handoffs'], ['collection', 'Rider collections'], ['transfer', 'Stock transfers']];
function actionAllowed(mod) { const b = q(`#delivery .card [data-module="${mod}"]:not([data-rec-action])`); return !!b && !b.classList.contains('persona-denied') && b.offsetParent !== null; }
function enhanceLogistics() {
  const host = q('#delivery'); if (!host) return;
  let sec = q('#logRecords', host);
  const anchor = q('[data-module="failedDelivery"]', host)?.closest('.card')?.parentElement;
  if (!sec) {
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', '<div class="card panel" id="logRecords"></div>');
    sec = q('#logRecords', host);
  }
  const recs = logisticsRecords(), shown = recs.filter(r => filter === 'all' || r.type === filter);
  const sig = JSON.stringify([filter, recs.map(r => [r.id, r.status]), [...open], qa('#delivery .card [data-module]').map(b => b.className)]);
  if (sec.dataset.sig === sig) return;
  sec.dataset.sig = sig;
  sec.innerHTML = `<h2 style="margin:0 0 4px">Logistics records</h2><p style="margin:0 0 8px">Every failed delivery, dispatch handoff, rider collection and stock transfer. Click a row to see its full details.</p>
    <div class="actions" style="flex-wrap:wrap;margin-bottom:8px">${FILTERS.map(([k, l]) => `<button class="btn${filter === k ? ' primary' : ''}" data-recfilter="${k}">${l} ${k === 'all' ? recs.length : recs.filter(r => r.type === k).length}</button>`).join('')}</div>
    <table class="table" data-records="1"><thead><tr><th>Record</th><th>Type</th><th>Reference</th><th>Details</th><th>Status</th><th></th></tr></thead><tbody>
    ${shown.map(r => `<tr class="rec-row" data-logrec="${esc(r.id)}" tabindex="0" style="cursor:pointer" aria-expanded="false"><td><b>${esc(r.id)}</b></td><td>${esc(r.label)}</td><td>${esc(r.ref)}</td><td>${esc(r.party)}</td><td><span class="badge${/required|risk/i.test(r.status) ? ' red' : /ready|transit/i.test(r.status) ? ' warn' : ''}">${esc(r.status)}</span></td><td class="rec-caret" style="text-align:right">⌄</td></tr>`).join('') || '<tr><td colspan="6">No records</td></tr>'}</tbody></table>`;
  qa('tr[data-logrec]', sec).forEach(tr => {
    const r = recs.find(x => x.id === tr.dataset.logrec);
    const act = r.action && actionAllowed(r.action[0]) ? `<div class="actions"><button class="btn primary" data-module="${r.action[0]}" data-rec-action="1">${r.action[1]}</button></div>` : '';
    tr._rec = {key: 'l:' + r.id, cols: 6, html: () => detailHtml(r.fields, {record: r.id, order: r.order}, act)};
    if (open.has(tr._rec.key)) toggle(tr, tr._rec.key, tr._rec.html(), 6);
  });
}

// ---------------- events
function onActivate(e) {
  const f = e.target.closest('[data-recfilter]');
  if (f) { filter = f.dataset.recfilter; const s = q('#logRecords'); if (s) s.dataset.sig = ''; enhanceLogistics(); return; }
  const row = e.target.closest('tr.rec-row');
  if (!row || !row._rec || e.target.closest('button, a, input, select, textarea')) return;
  if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
  if (e.type === 'keydown') e.preventDefault();
  toggle(row, row._rec.key, row._rec.html(), row._rec.cols);
}
document.addEventListener('click', onActivate);
document.addEventListener('keydown', onActivate);

let busy = false;
const run = () => { if (busy) return; busy = true; try { enhanceOrders(); enhanceLogistics(); } finally { busy = false; } };
new MutationObserver(() => { clearTimeout(run.t); run.t = setTimeout(run, 60); }).observe(document.body, {childList: true, subtree: true});
run();
window.AFMRecords = {refresh: run};
})();

