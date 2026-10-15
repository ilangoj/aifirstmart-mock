// ================================================================ customer shop
const SHOP_KEY = 'afm-shop-v1';
const shop0 = () => ({channel: 'web', who: null, carts: {}, orders: [], chat: [], otp: null, plan: 'now', baskets: {}, subs: []});
let SH = load(SHOP_KEY, shop0);
const saveSH = () => store(SHOP_KEY, SH);
const CH = () => window.AFMChannels?.state();
const products = () => { try { return items; } catch (e) { return []; } };
const avail = it => Math.max(0, it.s - (CH()?.reserved?.[it.id] || 0));
const cartKey = () => SH.who ? SH.who.key : 'guest';
const cart = () => (SH.carts[cartKey()] = SH.carts[cartKey()] || {});
const cartLines = () => Object.entries(cart() || {}).map(([sku, qty]) => ({it: products().find(x => x.id === sku), qty})).filter(l => l.it);
const cartTotal = () => cartLines().reduce((a, l) => a + l.it.p * l.qty, 0);
const CHANNEL = {web: 'Web shop', mobile_app: 'Mobile app', whatsapp: 'WhatsApp'};
function signinMethods() { const s = CH()?.signin || {}; return {email: s.email !== false, otp: !!s.otp, google: !!s.google, whatsapp: true}; }
function img(it, size = 96) {
  const m = window.AFMCatalogue?.mainImage(it.id);
  return m ? `<img src="${m.data}" alt="" style="width:${size}px;height:${size}px;object-fit:contain">` : `<span style="font-size:${Math.round(size / 2)}px" aria-hidden="true">${it.e || '📦'}</span>`;
}
function signedIn(key, label, method) {
  const guest = SH.carts.guest || {}, mine = SH.carts[key] = SH.carts[key] || {};
  for (const [sku, n] of Object.entries(guest)) mine[sku] = (mine[sku] || 0) + n;     // the guest cart joins the account
  const gb = SH.baskets.guest || {}, mb = SH.baskets[key] = SH.baskets[key] || {};
  for (const g of ['weekly', 'monthly']) for (const [sku, n] of Object.entries(gb[g] || {})) { mb[g] = mb[g] || {}; mb[g][sku] = Math.min(PLAN_MAX, (mb[g][sku] || 0) + n); }
  delete SH.baskets.guest; delete SH.carts.guest; SH.wantSignin = false;
  SH.who = {key, label, method}; audit('Customer shop', 'Customer signed in', `${label} · ${method} · ${CHANNEL[SH.channel]}`); saveSH(); renderShop(); say(`Signed in as ${label}`);
}
function shopSignin() {
  const m = signinMethods();
  if (SH.channel === 'whatsapp') return `<div class="card panel"><h2>WhatsApp</h2><p>On WhatsApp the customer is identified by their phone number, so there is no separate sign-in.</p>
    <div class="field"><label>Your WhatsApp number</label><input id="shWaPhone" value="98765 43210" inputmode="tel"></div><div class="actions"><button class="btn primary" id="shWaStart">Start chat</button></div></div>`;
  return `<div class="card panel" id="shSignin" style="max-width:460px"><h2>${cartLines().length ? 'Sign in to place your order' : 'Sign in'}</h2><p>${cartLines().length ? 'Your cart is kept: it moves into your account when you sign in.' : 'Sign in to keep your cart on every device and track your orders.'}</p>
    ${m.otp ? `<div class="field"><label>Mobile number</label><input id="shPhone" placeholder="98765 43210" inputmode="tel"></div><div class="actions"><button class="btn primary" id="shSendCode">Send code</button></div>
      ${SH.otp ? `<p role="status" style="background:#eef6ff;padding:6px 8px;border-radius:6px">Sandbox SMS to ${esc(SH.otp.phone)}: your code is <b>${SH.otp.code}</b></p><div class="field"><label>6-digit code</label><input id="shCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><div class="actions"><button class="btn primary" id="shVerify">Verify and continue</button></div>` : ''}` : ''}
    ${m.google ? `<div class="actions"><button class="btn" id="shGoogle"><b style="color:#4285f4">G</b> Continue with Google</button></div>` : ''}
    ${m.email ? `<details ${m.otp || m.google ? '' : 'open'}><summary>Sign in with email</summary><div class="field"><label>Email</label><input id="shEmail" type="email" autocomplete="email"></div><div class="field"><label>Password (at least 8 characters)</label><input id="shPass" type="password" autocomplete="current-password"></div><div class="actions"><button class="btn primary" id="shEmailGo">Sign in</button></div></details>` : ''}
    ${!m.otp && !m.google ? '<p style="font-size:13px">Tip for trainees: the Retail administrator can switch on mobile codes and Google in Customer sign-in.</p>' : ''}</div>`;
}
function shopCatalogue() {
  return `<div class="card panel"><h2>${SH.channel === 'web' ? 'Fresh groceries from Ulundurpet Main Store' : 'Shop'}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
    ${products().map(it => { const a = avail(it), inCart = (cart() || {})[it.id] || 0;
      return `<div class="card" style="padding:10px;text-align:center" data-shop-item="${esc(it.id)}">${img(it)}<div><b>${esc(it.n)}</b></div><div>${rs(it.p)}</div>
      <div style="font-size:12px;color:${a ? '#1a7f37' : '#d1242f'}">${a ? (a < 5 ? `Only ${a} left` : 'In stock') : 'Out of stock'}</div>
      <div class="actions" style="justify-content:center;margin-top:6px">${a ? (inCart ? `<button class="btn" data-shop-dec="${esc(it.id)}" aria-label="One fewer ${esc(it.n)}">−</button><b aria-live="polite">${inCart}</b><button class="btn" data-shop-inc="${esc(it.id)}" aria-label="One more ${esc(it.n)}" ${inCart >= a ? 'disabled' : ''}>＋</button>` : `<button class="btn primary" data-shop-inc="${esc(it.id)}">Add to cart</button>`) : ''}</div></div>`; }).join('')}</div></div>`;
}
function shopCart() {
  const lines = cartLines(), total = cartTotal();
  return `<div class="card panel" id="shCart"><h2>Your cart</h2>${lines.length ? `<table class="table"><tbody>${lines.map(l => `<tr><td><span data-waimg="${esc(l.it.id)}" data-size="32"></span> ${esc(l.it.n)}</td><td>× ${l.qty}</td><td style="text-align:right">${rs(l.it.p * l.qty)}</td></tr>`).join('')}
    <tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>${rs(total)}</b></td></tr></tbody></table>
    <div class="field"><label>Delivery</label><select id="shSlot"><option value="express">Express · within 45 minutes</option><option value="planned">Planned · tomorrow 4–6 PM</option><option value="pickup">Pick up at the store</option></select></div>
    <div class="field"><label>Payment</label><select id="shPay"><option value="upi">UPI</option><option value="card">Card</option><option value="cod">Cash on delivery</option></select></div>
    <p style="font-size:13px">Express delivery must be paid online. Your cart is the same on the web shop, mobile app and WhatsApp.</p>
    <div class="actions"><button class="btn primary" id="shCheckout">${SH.who ? `Place order · ${rs(total)}` : `Sign in to order · ${rs(total)}`}</button></div>` : '<p>Your cart is empty. Add items from the shelf.</p>'}</div>`;
}
const STEPS = ['Received', 'Packed', 'Out for delivery', 'Delivered'];
function shopOrders() {
  const mine = SH.orders.filter(o => o.who === SH.who?.key);
  return `<div class="card panel" id="shOrders"><h2>My orders</h2>${mine.length ? mine.map(o => `<div class="card" style="padding:10px;margin-bottom:8px" data-shop-order="${o.id}">
    <b>${o.id}</b> · ${CHANNEL[o.ch]} · ${o.service ? esc(o.service) : o.ch === 'web' ? 'Web order' : '⚡ Immediate delivery'} · ${rs(o.total)} · ${esc(o.slot)}<br><small>${o.lines.map(l => `${esc(l.n)} × ${l.qty}`).join(', ')}</small>
    <ol style="display:flex;gap:6px;list-style:none;padding:0;margin:8px 0;flex-wrap:wrap">${STEPS.map((s, i) => `<li class="badge${i <= o.step ? '' : ' warn'}" style="opacity:${i <= o.step ? 1 : .55}">${i <= o.step ? '✓ ' : ''}${s}</li>`).join('')}</ol>
    ${o.ret ? `<p>Return: <b>${esc(o.ret)}</b></p>` : ''}
    <div class="actions">${o.step < 3 ? `<button class="btn" data-shop-next="${o.id}" title="Practice only: move the order to its next step">Simulate next step</button>` : ''}${o.step === 3 && !o.ret ? `<button class="btn" data-shop-return="${o.id}">Return an item</button>` : ''}</div></div>`).join('') : '<p>No orders yet.</p>'}</div>`;
}
function waChat() {
  const msgs = SH.chat.filter(m => m.who === SH.who?.key);
  return `<div class="card panel" id="shChat" style="max-width:520px;background:#efeae2"><h2 style="margin-top:0">AIFirstMart Retail <small style="font-weight:400">· WhatsApp (sandbox)</small></h2>
    <div role="log" aria-live="polite" style="display:flex;flex-direction:column;gap:6px;max-height:min(480px,60vh);overflow:auto">${msgs.map(m => `<div style="align-self:${m.from === 'me' ? 'flex-end' : 'flex-start'};background:${m.from === 'me' ? '#d9fdd3' : '#fff'};padding:6px 10px;border-radius:8px;max-width:85%">${m.html}</div>`).join('')}</div>
    ${waMenu()}</div>`;
}

// ---------------- mobile app and WhatsApp: three ways to shop
const PLAN = {
  now: {icon: '⚡', label: 'Immediate delivery', short: '45 min', blurb: 'One order now, delivered within 45 minutes from Ulundurpet Main Store, or picked up at the store.'},
  weekly: {icon: '📅', label: 'Weekly plan', short: 'Every week', blurb: 'The same basket every week on the day you choose. Free delivery. Change, skip or pause any time before 8 PM the day before.'},
  monthly: {icon: '🗓', label: 'Monthly plan', short: 'Every month', blurb: 'Your monthly staples on the date you choose. Free delivery. Change, skip or pause any time before 8 PM the day before.'},
};
const PLAN_MAX = 10;
// Which products each group suggests first; everything else is still available under "More products".
const SUGGEST = {now: ['8901002', '8901007', '8901006'], weekly: ['8901002', '8901007', '8901006'], monthly: ['8901001', '8901003', '8901008', '8901005', '8901004']};
const QUICK_CATS = /dairy|fresh|produce|vegetable|fruit|bakery|snack|beverage/i;
const suggested = (g, it) => SUGGEST[g].includes(it.id) || (!/^89010\d\d$/.test(it.id) && (g === 'monthly' ? !QUICK_CATS.test(it.cat || '') : QUICK_CATS.test(it.cat || '')));
const curPlan = () => (SH.channel === 'web' ? 'now' : PLAN[SH.plan] ? SH.plan : 'now');
function basket(g) {
  if (g === 'now') return cart();
  const all = SH.baskets[cartKey()] = SH.baskets[cartKey()] || {};
  return (all[g] = all[g] || {});
}
const basketLines = g => Object.entries(basket(g)).map(([sku, qty]) => ({it: products().find(x => x.id === sku), qty})).filter(l => l.it);
const basketTotal = g => basketLines(g).reduce((a, l) => a + l.it.p * l.qty, 0);
const basketCount = g => basketLines(g).reduce((a, l) => a + l.qty, 0);
const mySubs = () => SH.subs.filter(x => x.who === SH.who?.key && x.status !== 'Cancelled');
const activeSub = g => mySubs().find(x => x.plan === g);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = ['Morning 7–9 AM', 'Evening 5–7 PM'];
const PAYS = {upi: 'UPI Autopay', card: 'Card on file', cod: 'Cash on delivery'};
const dstr = d => new Date(d).toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
function nextDate(plan, when, after = Date.now()) {
  const d = new Date(after); d.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 62; i++) { const x = new Date(d.getTime() + i * 86400000);
    if (plan === 'weekly' ? x.getDay() === Number(when) : x.getDate() === Number(when)) return x.getTime(); }
  return d.getTime() + 7 * 86400000;
}
function qtyControls(it, g, inB) {
  const a = avail(it), cap = g === 'now' ? a : PLAN_MAX;
  if (g === 'now' && !a) return '<small style="color:#d1242f">Out of stock</small>';
  return inB ? `<span style="display:inline-flex;align-items:center;gap:6px"><button class="btn" data-shop-dec="${esc(it.id)}" data-plan="${g}" aria-label="One fewer ${esc(it.n)}">−</button><b aria-live="polite">${inB}</b><button class="btn" data-shop-inc="${esc(it.id)}" data-plan="${g}" aria-label="One more ${esc(it.n)}" ${inB >= cap ? 'disabled' : ''}>＋</button></span>`
    : `<button class="btn primary" data-shop-inc="${esc(it.id)}" data-plan="${g}">Add</button>`;
}
function planTabs(cls = '') {
  return `<div role="tablist" aria-label="How do you want your groceries?" class="${cls}" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">${Object.entries(PLAN).map(([k, v]) => {
    const n = basketCount(k), on = curPlan() === k, sub = SH.who && activeSub(k);
    return `<button role="tab" aria-selected="${on}" data-shop-plan="${k}" style="padding:8px 4px;border-radius:10px;border:2px solid ${on ? '#0f6b4f' : '#d0d7de'};background:${on ? '#e7f5ef' : '#fff'};cursor:pointer;text-align:center;font:inherit">
      <span style="font-size:20px" aria-hidden="true">${v.icon}</span><br><b style="font-size:13px">${v.label}</b><br><small>${v.short}</small>${n ? `<br><span class="badge">${n} in basket</span>` : ''}${sub ? `<br><span class="badge" style="background:#ddf4ff">${sub.status === 'Paused' ? 'Paused' : 'Active'}</span>` : ''}</button>`; }).join('')}</div>`;
}
function productRows(g) {
  const b = basket(g), list = products(), sug = list.filter(it => suggested(g, it)), rest = list.filter(it => !suggested(g, it));
  const row = it => { const a = avail(it);
    return `<div data-shop-item="${esc(it.id)}" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #eee">${img(it, 52)}
      <div style="flex:1;min-width:0"><b>${esc(it.n)}</b><br>${rs(it.p)}${g === 'now' ? '' : ` <small>per ${g === 'weekly' ? 'week' : 'month'}</small>`}<br>
      <small style="color:${g !== 'now' || a ? '#1a7f37' : '#d1242f'}">${g === 'now' ? (a ? (a < 5 ? `Only ${a} left` : 'In stock') : 'Out of stock') : 'Stock is reserved before each delivery'}</small></div>${qtyControls(it, g, b[it.id] || 0)}</div>`; };
  return `<h3 style="margin:12px 0 2px;font-size:15px">Suggested for ${PLAN[g].label.toLowerCase()}</h3>${sug.map(row).join('')}
    ${rest.length ? `<h3 style="margin:14px 0 2px;font-size:15px">More products</h3>${rest.map(row).join('')}` : ''}`;
}
function appView() {
  const g = curPlan(), n = basketCount(g);
  return `<div class="afm-phone" style="max-width:430px;margin:0 auto;border:10px solid #1f2328;border-radius:28px;overflow:hidden;background:#fff">
    <div style="padding:10px 14px;background:#0f3d2e;color:#fff"><b>AIFirstMart</b><br><small>Delivering to Pondy Road, Ulundurpet</small></div>
    <div style="padding:10px">${planTabs()}<p style="margin:8px 0 0;font-size:13px">${PLAN[g].blurb}</p>${productRows(g)}</div>
    <div style="position:sticky;bottom:0;padding:10px;background:#0f6b4f;color:#fff;display:flex;justify-content:space-between;align-items:center">${n
      ? `<span><b>${n} item${n > 1 ? 's' : ''} · ${rs(basketTotal(g))}</b>${g === 'now' ? '' : ` a ${g === 'weekly' ? 'week' : 'month'}`}</span><a href="#shCart" style="color:#fff;font-weight:700">Review ${PLAN[g].label.toLowerCase()} →</a>`
      : `<span>${PLAN[g].icon} ${PLAN[g].label}: basket empty</span>`}</div></div>`;
}
// Checkout for the group being viewed: an order now, or a repeat plan.
function groupCheckout(g) {
  if (g === 'now') {
    const lines = basketLines('now'), total = basketTotal('now');
    return `<div class="card panel" id="shCart"><h2>⚡ Immediate delivery</h2>${lines.length ? `<table class="table"><tbody>${lines.map(l => `<tr><td><span data-waimg="${esc(l.it.id)}" data-size="32"></span> ${esc(l.it.n)}</td><td>× ${l.qty}</td><td style="text-align:right">${rs(l.it.p * l.qty)}</td></tr>`).join('')}
      <tr><td colspan="2"><b>Total</b></td><td style="text-align:right"><b>${rs(total)}</b></td></tr></tbody></table>
      <div class="field"><label>Delivery</label><select id="shSlot"><option value="express">Express · within 45 minutes</option><option value="pickup">Pick up at the store · ready in 30 minutes</option></select></div>
      <div class="field"><label>Payment</label><select id="shPay"><option value="upi">UPI</option><option value="card">Card</option><option value="cod">Cash on delivery</option></select></div>
      <p style="font-size:13px">Express delivery must be paid online. Pay at the counter for pickup.</p>
      <div class="actions"><button class="btn primary" id="shCheckout">${SH.who ? `Place order · ${rs(total)}` : `Sign in to order · ${rs(total)}`}</button></div>` : '<p>Your basket is empty. Add items from <b>Immediate delivery</b>.</p>'}</div>`;
  }
  const v = PLAN[g], lines = basketLines(g), total = basketTotal(g), sub = SH.who && activeSub(g), per = g === 'weekly' ? 'week' : 'month';
  const editing = sub && SH.editing === sub.id;
  if (sub && !editing) return `<div class="card panel" id="shCart"><h2>${v.icon} ${v.label}</h2><p>Your ${v.label.toLowerCase()} <b>${sub.id}</b> is <b>${sub.status.toLowerCase()}</b>. ${sub.status === 'Active' ? `Next delivery <b>${dstr(sub.next)}</b>, ${esc(sub.slot)}.` : ''}</p>
    <p style="font-size:13px">To change what comes each ${per}, choose <b>Change items</b>. Manage deliveries in <b>My plans</b>.</p><div class="actions"><button class="btn primary" data-sub-edit="${sub.id}">Change items</button></div></div>`;
  const when = editing ? sub.when : g === 'weekly' ? 6 : 1;
  const whenField = g === 'weekly' ? `<div class="field"><label>Delivery day</label><select id="shPlanWhen">${DAYS.map((d, i) => `<option value="${i}" ${i === Number(when) ? 'selected' : ''}>Every ${d}</option>`).join('')}</select></div>`
    : `<div class="field"><label>Delivery date</label><select id="shPlanWhen">${Array.from({length: 28}, (_, i) => i + 1).map(d => `<option value="${d}" ${d === Number(when) ? 'selected' : ''}>${d}${[, 'st', 'nd', 'rd'][d % 10 > 3 || (d > 10 && d < 14) ? 0 : d % 10] || 'th'} of every month</option>`).join('')}</select></div>`;
  return `<div class="card panel" id="shCart"><h2>${v.icon} ${editing ? `Change ${v.label.toLowerCase()} ${sub.id}` : `Your ${v.label.toLowerCase()}`}</h2>${lines.length ? `<table class="table"><tbody>${lines.map(l => `<tr><td><span data-waimg="${esc(l.it.id)}" data-size="32"></span> ${esc(l.it.n)}</td><td>× ${l.qty}</td><td style="text-align:right">${rs(l.it.p * l.qty)}</td></tr>`).join('')}
    <tr><td colspan="2"><b>Each ${per}</b></td><td style="text-align:right"><b>${rs(total)}</b></td></tr></tbody></table>
    ${whenField}<div class="field"><label>Time slot</label><select id="shPlanSlot">${SLOTS.map(x => `<option value="${x}" ${editing && sub.slot === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Payment</label><select id="shPlanPay">${Object.entries(PAYS).map(([k, l]) => `<option value="${k}" ${editing && sub.pay === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <p style="font-size:13px">Free delivery. You pay for each delivery when it is sent; prices are those on the delivery day. Changes close at 8 PM the day before.</p>
    <div class="actions">${editing ? '<button class="btn" id="shPlanEditCancel">Keep the plan as it was</button>' : ''}<button class="btn primary" id="shStartPlan">${!SH.who ? `Sign in to start · ${rs(total)} a ${per}` : editing ? `Save changes · ${rs(total)} a ${per}` : `Start ${v.label.toLowerCase()} · ${rs(total)} a ${per}`}</button></div>`
    : `<p>Your ${v.label.toLowerCase()} is empty. Add what you need every ${per}.</p>${editing ? '<div class="actions"><button class="btn" id="shPlanEditCancel">Keep the plan as it was</button></div>' : ''}`}</div>`;
}
function myPlans() {
  const list = mySubs(); if (!list.length) return '';
  return `<div class="card panel" id="shPlans"><h2>My plans</h2>${list.map(x => `<div class="card" style="padding:10px;margin-bottom:8px" data-sub="${x.id}">
    <b>${PLAN[x.plan].icon} ${PLAN[x.plan].label} · ${x.id}</b> <span class="badge${x.status === 'Paused' ? ' warn' : ''}">${x.status}</span><br>
    <small>${x.lines.map(l => `${esc(l.n)} × ${l.qty}`).join(', ')} · ${rs(x.lines.reduce((a, l) => a + l.p * l.qty, 0))} · ${x.plan === 'weekly' ? 'every ' + DAYS[x.when] : `on the ${x.when} of each month`} · ${esc(x.slot)} · ${PAYS[x.pay]}</small><br>
    ${x.status === 'Active' ? `Next delivery: <b>${dstr(x.next)}</b>` : 'No deliveries while paused'}${x.note ? `<br><small>${esc(x.note)}</small>` : ''}
    <div class="actions" style="flex-wrap:wrap;margin-top:6px">${x.status === 'Active' ? `<button class="btn" data-sub-run="${x.id}" title="Practice only: the delivery day has come">Delivery day (practice)</button><button class="btn" data-sub-skip="${x.id}">Skip next delivery</button><button class="btn" data-sub-pause="${x.id}">Pause</button>` : `<button class="btn" data-sub-pause="${x.id}">Resume</button>`}
      <button class="btn" data-sub-edit="${x.id}">Change items</button><button class="btn" data-sub-cancel="${x.id}">Cancel plan</button></div></div>`).join('')}</div>`;
}
function startPlan(g) {
  const lines = basketLines(g); if (!lines.length) return;
  if (!SH.who) { SH.wantSignin = true; saveSH(); renderShop(); return q('#shSignin input, #shSignin button')?.focus(); }
  const when = Number(q('#shPlanWhen').value), slot = q('#shPlanSlot').value, pay = q('#shPlanPay').value, v = PLAN[g];
  const data = {lines: lines.map(l => ({sku: l.it.id, n: l.it.n, qty: l.qty, p: l.it.p})), when, slot, pay};
  let sub = SH.editing && SH.subs.find(x => x.id === SH.editing && x.plan === g), verb;
  if (sub) { Object.assign(sub, data); if (sub.status === 'Active') sub.next = nextDate(g, when); verb = 'changed'; SH.editing = null; }
  else { sub = {id: `SUB-${g === 'weekly' ? 'W' : 'M'}-${1001 + SH.subs.length}`, who: SH.who.key, label: SH.who.label, ch: SH.channel, plan: g, status: 'Active', next: nextDate(g, when), delivered: 0, ...data}; SH.subs.unshift(sub); verb = 'started'; }
  basket(g); SH.baskets[cartKey()][g] = {};
  audit('Customer shop', `${v.label} ${verb}`, `${sub.id} · ${CHANNEL[SH.channel]} · ${rs(lines.reduce((a, l) => a + l.it.p * l.qty, 0))} · next ${dstr(sub.next)} · ${PAYS[pay]}`);
  if (SH.channel === 'whatsapp') waSay('shop', `✅ Your ${v.label.toLowerCase()} <b>${sub.id}</b> is ${verb}. First delivery <b>${dstr(sub.next)}</b>, ${esc(slot)}, ${PAYS[pay]}. Tap <b>My plans</b> to skip, pause or change it.`);
  saveSH(); renderShop(); say(`${v.label} ${sub.id} ${verb}. Next delivery ${dstr(sub.next)}`);
}
// The delivery day arrives: the plan becomes an ordinary order for the store, with the stock that is available.
function runSub(id) {
  const x = SH.subs.find(s => s.id === id); if (!x || x.status !== 'Active') return;
  const short = [], lines = [];
  for (const l of x.lines) { const it = products().find(p => p.id === l.sku); const a = it ? avail(it) : 0, qty = Math.min(a, l.qty);
    if (qty < l.qty) short.push(`${l.n}: ${qty} of ${l.qty}`); if (qty) lines.push({...l, p: it.p, qty}); }
  if (!lines.length) { x.note = `${dstr(x.next)}: nothing in stock, delivery not sent and nothing charged`; x.next = nextDate(x.plan, x.when, x.next); saveSH(); renderShop(); return say('Nothing in the plan is in stock. This delivery was not sent'); }
  const prefix = {web: 'WEB', mobile_app: 'APP', whatsapp: 'WA'}[x.ch], oid = `AFM-${prefix}-${9100 + SH.orders.length}`, total = lines.reduce((a, l) => a + l.p * l.qty, 0);
  const o = {id: oid, who: x.who, ch: x.ch, lines, total, slot: `${dstr(x.next)} · ${x.slot}`, pay: x.pay, step: 0, service: `${PLAN[x.plan].label} ${x.id}`};
  SH.orders.unshift(o); x.delivered++; x.note = short.length ? `${dstr(x.next)}: short of ${short.join(', ')}; not charged for missing items` : '';
  window.AFMChannels?.seed(S => { for (const l of lines) S.reserved[l.sku] = (S.reserved[l.sku] || 0) + l.qty;
    S.orders.unshift({id: oid, ch: x.ch, customer: x.label, items: `${PLAN[x.plan].label}: ` + lines.map(l => `${l.n} × ${l.qty}`).join(', '), status: 'Received · stock reserved'}); });
  audit('Customer shop', 'Plan delivery ordered', `${x.id} → ${oid} · ${rs(total)}${short.length ? ' · short: ' + short.join(', ') : ''}`);
  if (x.ch === 'whatsapp') waSay('shop', `📦 Today’s ${PLAN[x.plan].label.toLowerCase()} delivery <b>${oid}</b> · ${rs(total)}${short.length ? `. Short today: ${esc(short.join(', '))}; you are not charged for those` : ''}.`);
  x.next = nextDate(x.plan, x.when, x.next);
  saveSH(); renderShop(); say(`Plan delivery ${oid} sent to the store${short.length ? ' (some items short)' : ''}`);
}
function waMenu() {
  return `<div class="actions" style="flex-wrap:wrap;margin-top:8px">${Object.entries(PLAN).map(([k, v]) => `<button class="btn${curPlan() === k ? ' primary' : ''}" data-shopwa="g:${k}">${v.icon} ${v.label}</button>`).join('')}
    <button class="btn" data-shopwa="cart">Review my basket</button><button class="btn" data-shopwa="plans">My plans</button><button class="btn" data-shopwa="orders">Track my order</button></div>`;
}
function waGroupMessage(g) {
  const v = PLAN[g], list = products().filter(it => g !== 'now' || avail(it));
  const card = it => `<div style="background:#f7f7f7;border-radius:8px;padding:6px;text-align:center" data-wa-card="${esc(it.id)}"><span data-waimg="${esc(it.id)}"></span><div style="font-size:13px"><b>${esc(it.n)}</b><br>${rs(it.p)}</div><button class="btn" data-shop-inc="${esc(it.id)}" data-plan="${g}" style="margin-top:4px">＋ Add</button></div>`;
  const grid = xs => `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px">${xs.map(card).join('')}</div>`;
  const sug = list.filter(it => suggested(g, it)), rest = list.filter(it => !suggested(g, it));
  return `<b>${v.icon} ${v.label}</b><br>${v.blurb}<br><br><b>Suggested</b>${grid(sug)}${rest.length ? `<br><b>More products</b>${grid(rest)}` : ''}`;
}
function renderShop() {
  const el = q('#shop'); if (!el) return;
  const tabs = Object.entries(CHANNEL).map(([k, l]) => `<button class="btn${SH.channel === k ? ' primary' : ''}" data-shop-ch="${k}" aria-pressed="${SH.channel === k}">${l}</button>`).join('');
  const side = SH.who ? shopCart() + shopOrders() : SH.wantSignin ? shopSignin() : shopCart();
  const g = curPlan(), appSide = SH.wantSignin && !SH.who ? shopSignin() : groupCheckout(g) + (SH.who ? myPlans() + shopOrders() : '');
  const body = SH.channel === 'whatsapp' ? (!SH.who ? shopSignin() : `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,1fr);gap:14px;align-items:start" class="shop-grid"><div>${waChat()}</div><div>${groupCheckout(g)}${myPlans()}${shopOrders()}</div></div>`)
    : SH.channel === 'mobile_app' ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,1fr);gap:14px;align-items:start" class="shop-grid"><div>${appView()}</div><div>${appSide}</div></div>`
    : `<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:14px;align-items:start" class="shop-grid"><div>${shopCatalogue()}</div><div>${side}</div></div>`;
  el.innerHTML = `<div class="pagehead"><div><h1>Customer shop</h1><p>What a shopper sees. Orders here reach the store’s channel orders and stock.</p></div>
    <div class="actions">${SH.who ? `<span class="badge">${esc(SH.who.label)}</span><button class="btn" id="shSignout">Sign out</button>` : SH.channel !== 'whatsapp' && !SH.wantSignin ? '<button class="btn" id="shSigninBtn">Sign in</button>' : ''}</div></div>
    <div class="actions" role="group" aria-label="Channel" style="margin-bottom:10px">${tabs}</div>${body}`;
  const lg = el.querySelector('#shChat [role=log]'); if (lg) lg.scrollTop = lg.scrollHeight;
}
function waSay(from, html) { SH.chat.push({who: SH.who.key, from, html}); }
function placeOrder() {
  const lines = cartLines(); if (!lines.length) return;
  const slot = q('#shSlot').value, pay = q('#shPay').value;
  if (slot === 'express' && pay === 'cod') return say('Express delivery must be paid online. Choose UPI or Card, or a planned delivery for cash on delivery');
  for (const l of lines) if (avail(l.it) < l.qty) return say(`Only ${avail(l.it)} ${l.it.n} left. Reduce the quantity`);
  const C = window.AFMChannels, prefix = {web: 'WEB', mobile_app: 'APP', whatsapp: 'WA'}[SH.channel];
  const id = `AFM-${prefix}-${9100 + SH.orders.length}`;
  const o = {id, who: SH.who.key, ch: SH.channel, lines: lines.map(l => ({sku: l.it.id, n: l.it.n, qty: l.qty, p: l.it.p})), total: cartTotal(), slot: q('#shSlot').selectedOptions[0].text, pay, step: 0, service: SH.channel === 'web' ? '' : 'Immediate delivery'};
  SH.orders.unshift(o); SH.carts[SH.who.key] = {};
  C?.seed(S => { for (const l of o.lines) S.reserved[l.sku] = (S.reserved[l.sku] || 0) + l.qty;
    S.orders.unshift({id, ch: SH.channel, customer: SH.who.label, items: o.lines.map(l => `${l.n} × ${l.qty}`).join(', '), status: 'Received · stock reserved'}); });
  audit('Customer shop', 'Order placed', `${id} · ${CHANNEL[SH.channel]} · ${rs(o.total)} · ${pay.toUpperCase()}`);
  if (SH.channel === 'whatsapp') waSay('shop', `✅ Order <b>${id}</b> confirmed · ${rs(o.total)}. We’ll message you at each step.`);
  saveSH(); renderShop(); say(`Order ${id} placed`);
}
function returnDialog(oid) {
  const o = SH.orders.find(x => x.id === oid);
  open(`Return from ${oid}`, `<div class="field"><label>Item</label><select id="shRetItem">${o.lines.map((l, i) => `<option value="${i}">${esc(l.n)} × ${l.qty}</option>`).join('')}</select></div>
    <div class="field"><label>Quantity</label><input id="shRetQty" value="1" inputmode="numeric"></div>
    <div class="field"><label>Reason</label><select id="shRetWhy"><option value="Damaged or leaking">Damaged or leaking</option><option value="Wrong item delivered">Wrong item delivered</option><option value="Past its date">Past its date</option><option value="Changed my mind">Changed my mind</option></select></div>
    <p>Fresh food can be returned within 24 hours of delivery. Your refund goes back to the way you paid once the store approves it.</p>`, footer('shRetSave', 'Request return'));
  q('#shRetSave').onclick = () => {
    const l = o.lines[+q('#shRetItem').value], qty = parseInt(q('#shRetQty').value, 10), why = q('#shRetWhy').value;
    if (!(qty >= 1 && qty <= l.qty)) return say(`Enter a quantity from 1 to ${l.qty}`);
    const amount = l.p * qty, rid = 'RF-' + (505 + RF.items.length - 4);
    o.ret = `${l.n} × ${qty} · ${why} · refund ${rs(amount)} waiting for approval`;
    RF.items.unshift({id: rid, ref: `${oid} · ${CHANNEL[o.ch]}`, reason: `Customer return: ${why}`, amount, by: `${SH.who.label} · Customer`, status: 'Pending', log: []});
    audit('Customer shop', 'Return requested', `${oid} · ${l.n} × ${qty} · ${why} · ${rid}`);
    saveSH(); saveRF(); close(); renderShop(); renderRefunds(); say(`Return requested. Refund ${rid} is waiting for approval`);
  };
}

