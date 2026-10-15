/* AIFirstMart mock: Phase 1 usability fixes.
 * 1. The header shows the role being viewed and its scope (it was fixed at "Store manager").
 * 2. The header status follows the till's real state (it said Online while Sell said Offline).
 * 3. The audit trail names the person and role (it always said "Current operator").
 * 4. The Add product window refuses a barcode already in the catalogue.
 * 5. Setup → Users & roles and Access policy share one list of people.
 * 6. Screens the platform redraws for roles without them no longer throw errors. */
(() => {
'use strict';
if (window.__afmFixes) return; window.__afmFixes = true;
const q = s => document.querySelector(s);
const ta = () => { try { return lang === 'ta'; } catch (e) { return false; } };
const persona = () => { try { return session.activePersona; } catch (e) { return 'manager'; } };
const label = k => { try { return personaLabel(k); } catch (e) { return k; } };
const BUSINESS_WIDE = new Set(['owner', 'admin', 'oms', 'inventory', 'warehouse', 'logistics', 'procurement', 'pricing', 'catalogue', 'finance', 'support', 'payments']);
const PEOPLE = {admin: 'Lakshmi', manager: 'Raj', cashier: 'Kavya', oms: 'Arun', inventory: 'Meena', finance: 'Anitha', procurement: 'Bala'};

// ---------- 1 and 2: header
function header() {
  const role = q('.top .store b'), store = role && role.parentElement;
  if (role) {
    const want = label(persona());
    if (role.textContent !== want) role.textContent = want;
    const scope = persona() === 'customer' ? (ta() ? 'வாடிக்கையாளர் பார்வை' : 'Shopper’s view') : BUSINESS_WIDE.has(persona()) ? (ta() ? 'அனைத்துக் கடைகள்' : 'All stores') : (ta() ? 'உளுந்தூர்பேட்டை பிரதான கடை' : 'Ulundurpet Main Store');
    const last = store.lastChild;
    if (last && last.nodeType === 3 && last.textContent !== scope) last.textContent = scope;
  }
  const pill = q('.top [data-t="online"]');
  if (pill) {
    let off = false, queued = 0;
    try { off = !!closureState.offline; queued = closureState.offlineQueued || 0; } catch (e) {}
    const text = off ? (ta() ? `இணையமில்லை · ${queued} காத்திருப்பு` : `Offline · ${queued} queued`) : (ta() ? 'இணையத்தில்' : 'Online');
    if (pill.textContent !== text) pill.textContent = text;
    const dot = pill.parentElement.querySelector('b');
    if (dot) dot.style.color = off ? '#d4a72c' : '';
    pill.parentElement.title = off ? 'The till is selling offline; queued sales sync when it reconnects' : 'Connected';
  }
  // Staff-only status (till, scanner, printer) means nothing to a shopper.
  document.querySelectorAll('.top .status .pill:not(.afm-textsize)').forEach(el => { el.style.display = persona() === 'customer' ? 'none' : ''; });
  document.querySelectorAll('[data-sellops] .scopechip b').forEach(b => { if (b.textContent === 'Offline simulation') b.textContent = 'Offline (practice)'; });
}

// ---------- 3: named actors in the audit trail
function actorName() {
  const p = persona(), name = p === 'owner' ? '' : PEOPLE[p];
  return name ? `${name} · ${label(p)}` : label(p);
}
try {
  const baseAudit = auditEvent;
  auditEvent = function (area, action, detail) {
    const r = baseAudit.apply(this, arguments);
    try { if (functionalState.audit[0]) { functionalState.audit[0].actor = actorName(); persistFunctional(); } } catch (e) {}
    try { renderAudit(); } catch (e) {}
    return r;
  };
} catch (e) {}
// Events recorded before named actors cannot be attributed after the fact: say so plainly.
function legacyActors() {
  try {
    let n = 0;
    for (const x of functionalState.audit) if (!x.actor || x.actor === 'Current operator') { x.actor = 'Not recorded (before named users)'; n++; }
    if (n) { persistFunctional(); renderAudit(); }
  } catch (e) {}
}

// ---------- 4: duplicate barcodes in Add product
try {
  const baseCreate = productCreate;
  productCreate = function () {
    const r = baseCreate.apply(this, arguments);
    const btn = q('#createProduct');
    if (btn) {
      const done = btn.onclick;
      btn.onclick = ev => {
        const bar = (q('#pcBar')?.value || '').trim(), dup = items.find(x => x.id === bar);
        if (!/^\d{7,14}$/.test(bar)) return toast('Enter a barcode of 7 to 14 digits');
        if (dup) return toast(`Barcode ${bar} already belongs to ${dup.n}. Use a different barcode, or edit that product instead`);
        return done && done.call(btn, ev);
      };
    }
    return r;
  };
} catch (e) {}

// ---------- 5: one list of people
const POLICY_ROLE = {Cashier: 'cashier', 'Store manager': 'store_manager', Supervisor: 'store_manager', 'Stock associate': 'inventory_manager'};
function mirrorUsers() {
  const P = window.AFMPolicy; if (!P) return;
  try {
    const pol = P.state(), byName = new Map(pol.users.map(u => [u.name.toLowerCase(), u]));
    const NAMES = {tenant_owner: 'Business owner', cashier: 'Cashier', store_manager: 'Store manager', oms_supervisor: 'OMS supervisor', warehouse_supervisor: 'Warehouse supervisor',
      logistics_supervisor: 'Logistics supervisor', inventory_manager: 'Inventory Manager', procurement: 'Procurement', catalog_manager: 'Catalogue manager', pricing_manager: 'Pricing and promotions',
      finance: 'Finance and accounts', payment_approver: 'Payment approver', customer_support: 'Customer support', tenant_admin: 'Retail administrator'};
    const roleLabel = u => { const rs = P.effRoles ? P.effRoles(u) : u.roles; return rs.length ? rs.map(r => NAMES[r] || r).join(', ') : 'No role yet'; };
    let changed = false;
    for (const fu of functionalState.users) {
      const pu = byName.get(String(fu.name).toLowerCase());
      if (pu) { const want = roleLabel(pu); if (fu.role !== want) { fu.role = want; changed = true; } }
    }
    for (const pu of pol.users) if (!functionalState.users.some(fu => String(fu.name).toLowerCase() === pu.name.toLowerCase())) {
      functionalState.users.push({name: pu.name, role: roleLabel(pu), status: pu.status.startsWith('Disabled') ? 'Disabled' : 'Active'}); changed = true;
    }
    if (changed) persistFunctional();
  } catch (e) {}
}
function noteInUsersWindow() {
  const title = q('#overlay.show #modalTitle');
  if (!title || !/Users and roles|பயனர்கள்/.test(title.textContent) || q('#overlay.show [data-policy-link]')) return;
  q('#overlay.show #modalBody')?.insertAdjacentHTML('afterbegin', `<p data-policy-link style="background:#eef6ff;padding:8px 10px;border-radius:8px;margin-top:0">${ta()
    ? 'இங்கு அழைக்கப்படும் நபர்கள் அணுகல் கொள்கையிலும் சேர்க்கப்படுவர். பங்குகள், கடைகள், வரம்புகள் அங்கே நிர்வகிக்கப்படும்.'
    : 'People invited here also appear in <b>Access policy</b>, where their roles, stores, limits and temporary access are managed.'} <button class="link" data-a-policy>${ta() ? 'அணுகல் கொள்கையைத் திற →' : 'Open Access policy →'}</button></p>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-a-policy]')) {
    try { close(); } catch (er) {}
    const st = window.AFMPolicy && AFMPolicy.state(); if (st) { st.tab = 'users'; AFMPolicy.render(); }
    q('#side [data-nav="policy"]')?.click();
  }
  // An invitation from the old window is added to the Access policy as an invited user with no roles yet.
  if (e.target.closest('#addUserComplete')) {
    const name = (q('#userName')?.value || '').trim(), role = q('#userRole')?.value, scope = q('#userScope')?.value;
    setTimeout(() => {
      const P = window.AFMPolicy; if (!P || !name) return;
      const st = P.state();
      if (st.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return;
      st.users.push({id: 'U' + (st.users.length + 1) + (Date.now() % 1000), name, email: name.toLowerCase().replace(/[^a-z0-9]+/g, '.') + '@aifirstmart.example',
        roles: [], stores: scope && scope !== 'All stores' && scope !== 'RapidGo Partner' ? [scope] : [], limits: {}, status: 'Invited', lastSignIn: new Date().toISOString().slice(0, 10), temp: [], requested: POLICY_ROLE[role] || null});
      try { localStorage.setItem('afm-policy-v2', JSON.stringify(st)); } catch (er) {}
      P.render();
    }, 50);
  }
}, true);

// ---------- 6: screens the platform redraws for roles that do not have them
// injectTraining ends by relabelling a header element (.edition) that does not exist, which threw on every role switch.
try {
  const baseInject = injectTraining;
  injectTraining = function () {
    try { return baseInject.apply(this, arguments); }
    catch (e) { if (!/null \(setting 'textContent'\)/.test(String(e && e.message))) throw e; }
  };
} catch (e) {}
try {
  const baseMobile = renderMobile;
  renderMobile = function () { if (!q('#mobileapp')) return; return baseMobile.apply(this, arguments); };
} catch (e) {}
try {
  if (typeof renderWhatsApp === 'function') { const baseWa = renderWhatsApp; renderWhatsApp = function () { if (!q('#whatsapp')) return; return baseWa.apply(this, arguments); }; }
} catch (e) {}

// ---------- 7: file downloads on the published page
// The hosted viewer blocks plain download links; every CSV export (including the platform's own audit export)
// is routed through the viewer's save dialog when that is available, and keeps the normal link otherwise.
(() => {
  const baseClick = HTMLAnchorElement.prototype.click;
  let saver; const getSaver = () => saver || (saver = (async () => { try { return window.claude?.use ? await window.claude.use('downloads') : null; } catch (e) { return null; } })());
  HTMLAnchorElement.prototype.click = function () {
    const a = this, href = a.href || '', name = a.getAttribute('download');
    if (name == null || !/^(blob:|data:)/.test(href)) return baseClick.apply(a, arguments);
    getSaver().then(async d => {
      if (!d) return baseClick.apply(a);
      try { const blob = await (await fetch(href)).blob(); const r = await d.save({filename: name || 'download.csv', data: blob});
        if (r && r.status === 'saved') { try { toast(name + ' saved'); } catch (e) {} } }
      catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') { try { toast('The file could not be saved here. Try again from the Claude app'); } catch (er) {} } }
    });
  };
})();

let tick = 0;
setInterval(() => { header(); noteInUsersWindow(); if (++tick % 10 === 1) mirrorUsers(); }, 250);
header(); mirrorUsers(); legacyActors();
window.AFMFixes = {header, mirrorUsers, actorName};
})();
