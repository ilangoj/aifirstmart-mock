// ================================================================ price changes: bulk, scheduled, history
const PR_KEY = 'afm-pricing-v1';
let PR = load(PR_KEY, () => ({scheduled: [], history: [], snap: {}}));
const savePR = () => store(PR_KEY, PR);
function trackPrices() {
  let changed = false;
  for (const it of products()) {
    const was = PR.snap[it.id];
    if (was != null && was !== it.p) { PR.history.unshift({sku: it.id, n: it.n, from: was, to: it.p, at: nowT(), by: meName()}); changed = true; }
    if (was !== it.p) { PR.snap[it.id] = it.p; changed = true; }
  }
  PR.history = PR.history.slice(0, 200);
  if (changed) savePR();
}
function applyPrice(sku, price) {
  const it = products().find(x => x.id === sku); if (!it) return;
  it.p = price;
  const C = window.AFMCatalogue; if (C) { const st = C.state(); st.edits[sku] = {...(st.edits[sku] || {}), n: it.n, cat: it.cat || 'Grocery', p: price}; try { localStorage.setItem('afm-catalogue-v1', JSON.stringify(st)); } catch (e) {} C.persist?.(); C.render(); }
}
function runSchedule() {
  const due = PR.scheduled.filter(s => s.from <= today());
  if (!due.length) return;
  for (const s of due) { applyPrice(s.sku, s.to); audit('Pricing', 'Scheduled price applied', `${s.n} · ${rs(s.was)} → ${rs(s.to)} · effective ${s.from}`); }
  PR.scheduled = PR.scheduled.filter(s => s.from > today()); savePR(); trackPrices();
}
function pricingPanel() {
  const host = q('#catalogue'); if (!host || !pcan('pricing:write')) return;
  if (q('#priceTools', host)) return;
  const CATS = ['Grocery', 'Dairy', 'Fresh produce', 'Personal care', 'Household'], count = c => products().filter(x => (x.cat || 'Grocery') === c).length;
  const sched = PR.scheduled.map((s, i) => `<tr><td>${esc(s.n)}</td><td>${rs(s.was)} → <b>${rs(s.to)}</b></td><td>${esc(s.from)}</td><td><button class="link" data-sched-cancel="${i}">Cancel</button></td></tr>`).join('');
  const hist = PR.history.slice(0, 8).map(h => `<tr><td>${esc(h.at)}</td><td>${esc(h.n)}</td><td>${rs(h.from)} → ${rs(h.to)}</td><td>${esc(h.by)}</td></tr>`).join('');
  const panel = `<details class="card panel" id="priceTools"><summary><b>Price tools</b> · bulk change, scheduled prices and price history</summary>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
      <div class="field"><label for="bpCat">Category</label><select id="bpCat">${CATS.map(c => `<option value="${esc(c)}" ${count(c) ? '' : 'disabled'}>${esc(c)} (${count(c)} products)</option>`).join('')}</select></div>
      <div class="field"><label for="bpPct">Change (%)</label><input id="bpPct" value="5" style="width:70px" inputmode="decimal"></div>
      <div class="field"><label for="bpFrom">Effective from</label><input id="bpFrom" type="date" value="${today()}" min="${today()}"></div>
      <button class="btn" id="bpPreview" style="margin-bottom:12px">Preview</button></div>
    <div id="bpPreviewOut"></div>
    <h3>Scheduled</h3>${sched ? `<table class="table"><thead><tr><th>Product</th><th>Change</th><th>From</th><th></th></tr></thead><tbody>${sched}</tbody></table>` : '<p>No scheduled price changes.</p>'}
    <h3>Recent price history</h3>${hist ? `<table class="table" id="priceHistory"><thead><tr><th>When</th><th>Product</th><th>Change</th><th>By</th></tr></thead><tbody>${hist}</tbody></table>` : '<p>No price changes recorded yet.</p>'}</details>`;
  const anchor = q('.pagehead', host);
  anchor ? anchor.insertAdjacentHTML('afterend', panel) : host.insertAdjacentHTML('afterbegin', panel);
  if (PR.open) q('#priceTools').open = true;
}
let preview = null;
function bulkPreview() {
  const cat = q('#bpCat').value, pct = Number(q('#bpPct').value), from = q('#bpFrom').value;
  if (!Number.isFinite(pct) || pct === 0 || pct < -50 || pct > 50) return say('Enter a change between −50% and 50%, not 0');
  if (!from || from < today()) return say('Choose today or a future date');
  const list = products().filter(x => (x.cat || 'Grocery') === cat).map(x => ({sku: x.id, n: x.n, was: x.p, to: Math.round(x.p * (1 + pct / 100) * 2) / 2, from}));
  preview = list;
  q('#bpPreviewOut').innerHTML = `<table class="table"><thead><tr><th>Product</th><th>Now</th><th>New (rounded to 50 paise)</th></tr></thead><tbody>${list.map(l => `<tr><td>${esc(l.n)}</td><td>${rs(l.was)}</td><td><b>${rs(l.to)}</b></td></tr>`).join('')}</tbody></table>
    <div class="actions"><button class="btn" id="bpCancel">Cancel</button><button class="btn primary" id="bpApply">${from === today() ? `Apply to ${list.length} products now` : `Schedule ${list.length} products for ${from}`}</button></div>`;
}
function bulkApply() {
  if (!preview || !pcan('pricing:write')) return;
  const now = preview[0]?.from === today();
  if (now) { for (const l of preview) applyPrice(l.sku, l.to); trackPrices(); audit('Pricing', 'Bulk price change applied', `${preview.length} products · ${preview.map(l => `${l.n} ${rs(l.was)} → ${rs(l.to)}`).join('; ')}`); }
  else { PR.scheduled.push(...preview); audit('Pricing', 'Price change scheduled', `${preview.length} products from ${preview[0].from}`); }
  const n = preview.length; preview = null; PR.open = true; savePR(); q('#priceTools')?.remove(); pricingPanel();
  say(now ? `${n} prices changed` : `${n} price changes scheduled`);
}

