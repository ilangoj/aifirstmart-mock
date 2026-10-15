
/* AIFirstMart mock: Channels and Customer sign-in screens (sandbox).
 * Mirrors the Connector and Identity Framework: connections start in sandbox, credentials are masked,
 * channels see only on hand − buffer − reserved, and every action is written to the audit trail. */
(() => {
'use strict';
if (window.__afmChannels) return; window.__afmChannels = true;
const KEY = 'afm-channels-v1';
const q = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const CH = [
  {id: 'whatsapp', name: 'WhatsApp', kind: 'Customer channel', orders: true, fields: [['phoneId', 'Phone number ID'], ['wabaId', 'WhatsApp Business Account ID'], ['token', 'Access token'], ['secret', 'App secret']]},
  {id: 'facebook', name: 'Facebook and Instagram', kind: 'Customer channel', orders: false, fields: [['catalogId', 'Catalogue ID'], ['token', 'Access token']]},
  {id: 'mobile_app', name: 'Mobile app', kind: 'Customer channel', orders: true, fields: [['project', 'Push project ID'], ['key', 'Push server key']]},
  {id: 'amazon', name: 'Amazon', kind: 'Marketplace', orders: true, fields: [['seller', 'Seller ID'], ['client', 'Login with Amazon client ID'], ['secret', 'Client secret'], ['refresh', 'Refresh token']]},
  {id: 'flipkart', name: 'Flipkart', kind: 'Marketplace', orders: true, fields: [['app', 'Application ID'], ['secret', 'Application secret'], ['location', 'Flipkart location ID']]},
  {id: 'ondc', name: 'ONDC', kind: 'Open network', orders: true, fields: [['sellerApp', 'Seller app'], ['key', 'API key']]},
];
const PREFIX = {whatsapp: 'WA', mobile_app: 'APP', amazon: 'AMZ', flipkart: 'FK', ondc: 'ONDC'};
const blank = () => ({conn: {}, log: [], orders: [], reserved: {}, signin: {email: true, otp: false, whatsapp: false, google: false, googleStaff: false, mfa: true}, otp: null, lastLogin: null, customers: []});
let S; try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { S = blank(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const role = () => { try { return session.activePersona; } catch (e) { return ''; } };
const CAN = {connect: ['admin'], publish: ['admin'], sync: ['admin', 'manager'], simulate: ['admin'], suspend: ['admin', 'owner'], resume: ['admin'], signin: ['admin']};
const PERM = {connect: 'connectors:manage', simulate: 'connectors:manage', resume: 'connectors:manage', publish: 'catalog:publish', sync: 'inventory:sync', suspend: 'channels:suspend', signin: 'signin:manage'};
// The published access policy decides; the fixed list is only a fallback when the policy screen is absent.
// In sandbox, whoever configures connectors may test-publish and test-sync; live work needs the business permission.
const allowed = (a, c) => window.AFMPolicy ? (window.AFMPolicy.can(PERM[a]) || (['publish', 'sync'].includes(a) && c && c.status === 'Sandbox' && window.AFMPolicy.can('connectors:manage'))) : (CAN[a] || []).includes(role());
const prods = () => { try { return items; } catch (e) { return []; } };
const stamp = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
const audit = (action, detail) => { try { auditEvent('Channels', action, detail); } catch (e) {} };
const log = (ch, event, detail) => { S.log.unshift({time: stamp(), ch, event, detail}); S.log = S.log.slice(0, 40); };
const avail = (it, c) => c.status === 'Suspended' ? 0 : Math.max(0, it.s - (c.buffer || 0) - (S.reserved[it.id] || 0));
const chName = id => (CH.find(c => c.id === id) || {}).name || id;

// ---------------- mounting into the mock's navigation
function mount() {
  try {
    const add = (p, ids) => ids.forEach(id => { if (PERSONAS[p] && !PERSONAS[p].nav.includes(id)) PERSONAS[p].nav.push(id); });
    add('admin', ['channels', 'signin']); add('owner', ['channels']); add('manager', ['channels']);
  } catch (e) {}
  const side = q('#side');
  if (side && !side.querySelector('[data-nav="channels"]')) {
    const last = [...side.querySelectorAll('.navbtn')].pop();
    (last || side).insertAdjacentHTML(last ? 'afterend' : 'beforeend', '<button class="navbtn" data-nav="channels">⇄ <span>Channels</span></button><button class="navbtn" data-nav="signin">⚿ <span>Customer sign-in</span></button>');
  }
  const host = q('#setup')?.parentElement;
  if (host && !q('#channels')) host.insertAdjacentHTML('beforeend', '<section class="screen" id="channels"></section><section class="screen" id="signin"></section>');
  try { applyPersonaNav(); } catch (e) {}
  render();
}

// ---------------- rendering
function badge(c) {
  if (!c) return '<span class="badge">Not connected</span>';
  const cls = c.status === 'Live' ? '' : c.status === 'Suspended' ? 'red' : 'warn';
  return `<span class="badge ${cls}">${esc(c.status)}</span>`;
}
function card(ch) {
  const c = S.conn[ch.id];
  const btn = (act, label, show = true) => show && allowed(act, c) ? `<button class="btn${act === 'connect' ? ' primary' : ''}" data-ch-act="${act}" data-ch="${ch.id}">${label}</button>` : '';
  const health = c && c.health ? `<p class="${c.health.alert ? 'danger-note' : ''}" data-ch-health="${ch.id}">Stock-error cancellations: <b>${esc(c.health.cancellations)}</b> today (alert above 1%)</p>` : '';
  const facts = c ? `<p>Stores: <b>${esc(c.stores)}</b> · Safety buffer: <b>${c.buffer}</b> · Credentials: <b>${esc(c.masked)}</b></p>
    ${c.imageWarning ? `<p style="background:#fff4d6;padding:6px 8px;border-radius:6px" data-ch-imgwarn="${ch.id}">Images: ${esc(c.imageWarning)}</p>` : ''}
    <p>Catalogue: <b>${c.published ? c.published + ' products' : 'not published'}</b> · Stock: <b>${c.stock ? 'synced ' + esc(c.syncedAt) : 'not synced'}</b></p>${c.suspendReason ? `<p>Suspended: <b>${esc(c.suspendReason)}</b></p>` : ''}` : '<p>Not connected. Connect in sandbox first; live needs certification and approval.</p>';
  const actions = !c ? btn('connect', 'Connect') :
    btn('publish', 'Publish catalogue', c.status !== 'Suspended') + btn('sync', 'Sync stock', c.status !== 'Suspended') +
    btn('simulate', 'Simulate order', ch.orders && c.status === 'Sandbox') + btn('suspend', 'Suspend', c.status !== 'Suspended') + btn('resume', 'Resume', c.status === 'Suspended');
  return `<div class="card panel" data-ch-card="${ch.id}"><div class="pagehead" style="margin:0 0 6px"><div><h2 style="margin:0">${esc(ch.name)}</h2><p>${esc(ch.kind)}</p></div>${badge(c)}</div>${facts}${health}<div class="actions" style="margin-top:8px;flex-wrap:wrap">${actions}</div></div>`;
}
function render() {
  const el = q('#channels'); if (!el) return;
  const connected = CH.filter(ch => S.conn[ch.id]);
  const stockRows = prods().map(it => `<tr><td>${esc(it.n)}</td><td>${it.s}</td><td>${S.reserved[it.id] || 0}</td>${connected.map(ch => `<td data-ch-stock="${ch.id}:${it.id}">${S.conn[ch.id].stock ? S.conn[ch.id].stock[it.id] ?? '–' : '–'}</td>`).join('')}</tr>`).join('');
  el.innerHTML = `<div class="pagehead"><div><h1>Channels</h1><p>Sell through customer channels and marketplaces from one catalogue and one stock position</p></div></div>
  <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">${CH.map(card).join('')}</div>
  <div class="card panel" id="chStockTable"><h2>Stock published to channels</h2><p>Each channel sees on hand − safety buffer − reserved, never below zero. A suspended channel shows 0.</p>
  <table class="table"><thead><tr><th>Product</th><th>On hand</th><th>Reserved</th>${connected.map(ch => `<th>${esc(ch.name)}</th>`).join('')}</tr></thead><tbody>${stockRows}</tbody></table></div>
  <div class="card panel" id="chOrders"><h2>Channel orders</h2><table class="table"><thead><tr><th>Order</th><th>Channel</th><th>Customer</th><th>Items</th><th>Status</th></tr></thead><tbody>${S.orders.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(chName(o.ch))}</td><td>${esc(o.customer)}</td><td>${esc(o.items)}</td><td>${esc(o.status)}</td></tr>`).join('') || '<tr><td colspan="5">No channel orders yet</td></tr>'}</tbody></table></div>
  <div class="card panel" id="chLog"><h2>Activity</h2><table class="table"><thead><tr><th>Time</th><th>Channel</th><th>Event</th><th>Detail</th></tr></thead><tbody>${S.log.slice(0, 10).map(l => `<tr><td>${esc(l.time)}</td><td>${esc(chName(l.ch))}</td><td>${esc(l.event)}</td><td>${esc(l.detail)}</td></tr>`).join('') || '<tr><td colspan="4">No activity yet</td></tr>'}</tbody></table></div>`;
  renderSignin();
}
const ROLES = [['Tenant owner', 'Everything in the business, including users and channels', 'All stores'], ['Retail administrator', 'Users, roles, channels, sign-in settings', 'All stores'],
  ['Store manager', 'Orders, stock, approvals, stock sync', 'Assigned stores'], ['Cashier', 'Sales and discounts within their limit', 'Assigned stores'],
  ['Catalogue manager', 'Products and listings', 'All stores'], ['Customer', 'Their own cart, orders and addresses', 'Own records only']];
function renderSignin() {
  const el = q('#signin'); if (!el) return;
  const s = S.signin, chk = (id, on, label) => `<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
  el.innerHTML = `<div class="pagehead"><div><h1>Customer sign-in</h1><p>How shoppers and staff prove who they are</p></div></div>
  <div class="card panel"><h2>Sign-in methods</h2>${chk('siEmail', s.email, 'Email and password (web shop and apps)')}${chk('siOtp', s.otp, 'Mobile number with one-time code (mobile app)')}${chk('siWa', s.whatsapp, 'WhatsApp (phone number from Meta’s signed message)')}${chk('siGoogle', s.google, 'Sign in with Google (Gmail) for customers')}${chk('siGoogleStaff', s.googleStaff, 'Sign in with Google for staff, only for email addresses an administrator has invited')}${chk('siMfa', s.mfa, 'Staff: second-step code for the owner, administrator, store managers and anyone who approves or reconciles payments')}
  <p>One-time codes: 6 digits, expire after 5 minutes, 5 attempts, at most 3 codes per number in 10 minutes.</p><div class="actions"><button class="btn primary" id="siSave">Save</button></div></div>
  <div class="card panel"><h2>Test a customer sign-in (sandbox)</h2><div class="field"><label>Mobile number</label><input id="otpPhone" placeholder="98765 43210"></div>
  <div class="actions"><button class="btn" id="otpSend">Send code</button></div><p id="otpSms">${S.otp ? esc(S.otp.msg) : ''}</p>
  <div class="field"><label>Code</label><input id="otpCode" inputmode="numeric" maxlength="6"></div><div class="actions"><button class="btn primary" id="otpVerify">Verify</button></div>
  <p id="otpResult">${S.lastLogin ? esc(S.lastLogin.msg) : ''}</p></div>
  <div class="card panel" id="googleCard"><h2>Test Sign in with Google (sandbox)</h2>
  <p>Google checks the password and its own security steps; AIFirstMart receives a signed token with the verified email address. In sandbox, the Google window is simulated.</p>
  <div class="actions"><button class="btn" id="googleSignIn" style="display:inline-flex;align-items:center;gap:8px"><span style="font-weight:700;color:#4285f4">G</span> Sign in with Google</button></div>
  <p id="googleResult">${S.googleLogin ? esc(S.googleLogin.msg) : ''}</p></div>
  <div class="card panel"><h2>Roles and permissions</h2><table class="table"><thead><tr><th>Role</th><th>Can</th><th>Scope</th></tr></thead><tbody>${ROLES.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
  <p>The server checks every action against these roles, the business, the store and any limits. Hiding a button is not the control.</p></div>`;
}

// ---------------- actions
function deny(a) { toast(`Your role cannot ${a === 'sync' ? 'sync stock' : a} on this screen`); }
function connectDialog(ch) {
  open(`Connect ${ch.name}`, `<div class="field"><label>Mode</label><select id="chMode"><option value="Sandbox">Sandbox</option><option value="Live">Live</option></select></div>
    ${ch.fields.map(([k, label]) => `<div class="field"><label>${label}</label><input type="password" data-cred="${k}" autocomplete="off"></div>`).join('')}
    <div class="field"><label>Stores</label><select id="chStores"><option value="Ulundurpet Main Store">Ulundurpet Main Store</option><option value="All stores">All stores</option></select></div>
    <div class="field"><label>Safety buffer (units held back per product)</label><input id="chBuffer" value="0" inputmode="numeric"></div>
    <p>Credentials are encrypted in the vault. Nobody can read them back, only replace or revoke them.</p>`, footer('chConnectSave', 'Connect'));
  q('#chConnectSave').onclick = () => {
    const creds = [...document.querySelectorAll('#modalBody [data-cred]')];
    if (creds.some(i => !i.value.trim())) return toast('Fill every credential field');
    if (q('#chMode').value === 'Live') return toast('Live needs certification and approval. Connect in sandbox first');
    const buffer = parseInt(q('#chBuffer').value, 10);
    if (!(buffer >= 0)) return toast('Enter a safety buffer of 0 or more');
    S.conn[ch.id] = {mode: 'Sandbox', status: 'Sandbox', stores: q('#chStores').value, buffer, masked: '•••• ' + creds[0].value.trim().slice(-4), published: 0, stock: null};
    log(ch.id, 'Connected', `Sandbox · ${S.conn[ch.id].stores} · buffer ${buffer}`); audit('Channel connected', `${ch.name} · sandbox · buffer ${buffer}`);
    save(); close(); render(); toast(`${ch.name} connected in sandbox`);
  };
}
function suspendDialog(ch) {
  open(`Suspend ${ch.name}`, `<div class="field"><label>Reason</label><select id="chReason"><option value="Stock errors">Stock errors</option><option value="Security concern">Security concern</option><option value="Compliance lapse">Compliance lapse</option><option value="Other">Other</option></select></div>
    <div class="field"><label>Note</label><input id="chNote"></div><p>New orders stop and the channel’s stock is set to 0. Orders already placed are still completed.</p>`, footer('chSuspendSave', 'Suspend channel'));
  q('#chSuspendSave').onclick = () => {
    const c = S.conn[ch.id]; c.status = 'Suspended'; c.suspendReason = q('#chReason').value + (q('#chNote').value.trim() ? ' – ' + q('#chNote').value.trim() : '');
    c.stock = Object.fromEntries(prods().map(it => [it.id, 0])); c.syncedAt = stamp();
    log(ch.id, 'Suspended', c.suspendReason); audit('Channel suspended', `${ch.name} · ${c.suspendReason}`); save(); close(); render(); toast(`${ch.name} suspended; its stock is now 0`);
  };
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ch-act]');
  if (b) {
    const a = b.dataset.chAct, ch = CH.find(x => x.id === b.dataset.ch), c = S.conn[ch.id];
    if (!allowed(a, c)) return deny(a);
    if (a === 'connect') return connectDialog(ch);
    if (a === 'publish') {
      c.published = prods().length;
      const C = window.AFMCatalogue, noMain = C ? prods().filter(it => !C.mainImage(it.id)).length : 0;
      const noInfo = C && ch.id === 'ondc' ? prods().filter(it => !['Ingredients', 'Nutrition'].every(r => C.imagesOf(it.id).some(i => i.role === r))).length : 0;
      const warn = [noMain ? `${noMain} without a main image` : '', noInfo ? `${noInfo} without ingredient and nutrition images` : ''].filter(Boolean).join('; ');
      c.imageWarning = warn;
      log(ch.id, 'Catalogue published', `${c.published} products${warn ? ' · ' + warn : ''}`); audit('Catalogue published', `${ch.name} · ${c.published} products${warn ? ' · ' + warn : ''}`);
      toast(warn ? `Published to ${ch.name}: ${warn}. The channel may reject these listings` : `Catalogue published to ${ch.name}`);
    }
    if (a === 'sync') { c.stock = Object.fromEntries(prods().map(it => [it.id, avail(it, c)])); c.syncedAt = stamp(); log(ch.id, 'Stock synced', `${prods().length} products`); audit('Stock synced', `${ch.name} · buffer ${c.buffer}`); toast(`Stock synced to ${ch.name}`); }
    if (a === 'simulate') {
      const it = prods().find(x => x.id === '8901002'); const qty = 2;
      if (!it || avail(it, c) < qty) return toast('Not enough available stock for the sandbox order');
      S.reserved[it.id] = (S.reserved[it.id] || 0) + qty;
      const o = {id: `${PREFIX[ch.id]}-${1001 + S.orders.length}`, ch: ch.id, customer: ch.id === 'whatsapp' ? '+91 98765 43210' : 'Sandbox customer', items: `${it.n} × ${qty}`, status: 'Received · stock reserved'};
      S.orders.unshift(o); log(ch.id, 'Order received', `${o.id} · ${o.items}`); audit('Channel order received', `${ch.name} · ${o.id} · ${o.items}`); toast(`Sandbox order ${o.id} received`);
    }
    if (a === 'suspend') return suspendDialog(ch);
    if (a === 'resume') { c.status = c.mode; c.suspendReason = ''; log(ch.id, 'Resumed', 'Sync stock to publish availability again'); audit('Channel resumed', ch.name); toast(`${ch.name} resumed. Sync stock to publish availability`); }
    save(); render(); return;
  }
  if (e.target.closest('#siSave')) {
    if (!allowed('signin')) return deny('change sign-in settings');
    S.signin = {email: q('#siEmail').checked, otp: q('#siOtp').checked, whatsapp: q('#siWa').checked, google: q('#siGoogle').checked, googleStaff: q('#siGoogleStaff').checked, mfa: q('#siMfa').checked};
    audit('Sign-in settings saved', Object.entries(S.signin).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'); save(); toast('Sign-in settings saved'); return;
  }
  if (e.target.closest('#googleSignIn')) {
    if (!S.signin.google) return toast('Sign in with Google is switched off. Turn it on and save first');
    open('Sign in with Google', `<p style="margin-top:0"><b style="color:#4285f4">G</b> Choose an account to continue to <b>AIFirstMart Retail</b> (sandbox).</p>
      <div class="field"><label>Google account email</label><input id="gEmail" value="priya.s@gmail.com"></div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="gVerified" checked> Google has verified this email</label>
      <p>Google will share your name, email address and profile picture with AIFirstMart Retail.</p>`, footer('gContinue', 'Continue'));
    q('#gContinue').onclick = () => {
      const email = q('#gEmail').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter a valid email address');
      if (!q('#gVerified').checked) { close(); audit('Google sign-in refused', `${email} · email not verified by Google`); return toast('Refused: Google has not verified this email'); }
      let cus = S.customers.find(c => c.email === email), linked = !!cus;
      if (!cus) { cus = {id: 'CUS-' + (1001 + S.customers.length), email}; S.customers.push(cus); }
      cus.google = true;
      S.googleLogin = {customer: cus.id, email, msg: `Signed in with Google: customer ${cus.id} (${email}) · ${linked ? 'existing account' : 'new account'} · role customer · access token valid for 15 minutes`};
      audit('Customer signed in', `${cus.id} · Google · ${email}`); save(); close(); renderSignin(); toast('Signed in with Google (sandbox)');
    };
    return;
  }
  if (e.target.closest('#otpSend')) {
    if (!S.signin.otp) return toast('Mobile sign-in is switched off. Turn it on and save first');
    const digits = (q('#otpPhone').value || '').replace(/\D/g, '');
    const phone = digits.length === 10 ? '+91' + digits : digits.length === 12 && digits.startsWith('91') ? '+' + digits : null;
    if (!phone) return toast('Enter a valid mobile number');
    const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    S.otp = {phone, code, attempts: 0, expires: Date.now() + 5 * 60 * 1000, msg: `Sandbox SMS to ${phone}: your AIFirstMart code is ${code}. It expires in 5 minutes.`};
    audit('Sign-in code sent', phone); save(); renderSignin(); q('#otpPhone').value = phone; toast('Code sent (sandbox)'); return;
  }
  if (e.target.closest('#otpVerify')) {
    const o = S.otp; const code = (q('#otpCode').value || '').trim();
    if (!o || Date.now() > o.expires) { S.otp = null; save(); renderSignin(); return toast('Code expired. Request a new one'); }
    o.attempts += 1;
    if (o.attempts > 5) { S.otp = null; save(); renderSignin(); return toast('Too many attempts. Request a new code'); }
    if (code !== o.code) { save(); return toast(`Incorrect code. ${5 - o.attempts} attempts left`); }
    let cus = S.customers.find(c => c.phone === o.phone);
    if (!cus) { cus = {id: 'CUS-' + (1001 + S.customers.length), phone: o.phone}; S.customers.push(cus); }
    S.lastLogin = {customer: cus.id, phone: o.phone, msg: `Signed in: customer ${cus.id} (${o.phone}) · business AIFirstMart Retail · role customer · access token valid for 15 minutes`};
    S.otp = null; audit('Customer signed in', `${cus.id} · mobile code`); save(); renderSignin(); toast('Customer signed in (sandbox)'); return;
  }
}, false);

window.AFMChannels = {state: () => S, reset: () => { S = blank(); save(); render(); }, seed: fn => { fn(S); save(); render(); }, render};
// The mock rebuilds its menu on role and language changes; keep our entries present and correctly permitted.
const NAV_ROLES = {channels: ['admin', 'owner', 'manager'], signin: ['admin']};
function ensure() {
  if (!q('#side [data-nav="channels"]') || !q('#channels')) mount();
  const pv = (window.AFMPolicy ? AFMPolicy.state().published.version : 0) + ':' + role();
  if (q('#channels') && q('#channels').dataset.pv !== pv) { q('#channels').dataset.pv = pv; render(); }
  for (const [id, roles] of Object.entries(NAV_ROLES)) {
    const btn = q(`#side [data-nav="${id}"]`); if (btn) btn.classList.toggle('persona-denied', !roles.includes(role()));
    const sec = q('#' + id);
    if (sec && sec.classList.contains('active') && !roles.includes(role())) { sec.classList.remove('active'); q('#command')?.classList.add('active'); }
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
setInterval(ensure, 300);
})();

