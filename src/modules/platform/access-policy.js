
/* AIFirstMart mock: Access policy.
 * Step 1, roles and permissions: a matrix of permissions by role, grouped by the six persona categories.
 * Category baselines are locked; role additions and limit ceilings are edited in a draft and published.
 * Step 2, users and roles: a matrix of users by role with stores and limits, validated on every change.
 * The published policy drives the Channels, Catalogue and Customer sign-in screens through AFMPolicy.can(). */
(() => {
'use strict';
if (window.__afmPolicy) return; window.__afmPolicy = true;
const KEY = 'afm-policy-v2';
const q = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const audit = (a, d) => { try { auditEvent('Access policy', a, d); } catch (e) {} };

const AREAS = [
  ['Selling', [['sales:write', 'Ring up sales and take payment'], ['discount:apply', 'Apply discounts within limit'], ['returns:write', 'Process returns'], ['shift:close', 'Close a till shift']]],
  ['Orders and fulfilment', [['orders:read', 'View orders'], ['orders:write', 'Create, assign and update orders'], ['sourcing:write', 'Allocate orders to stores'], ['shipments:write', 'Pick, pack and hand over shipments'], ['delivery:write', 'Update deliveries and riders'], ['riders:manage', 'Manage riders and collections']]],
  ['Stock and supply', [['stock:read', 'View stock'], ['inventory:write', 'Count and adjust stock'], ['inventory:sync', 'Push stock to channels'], ['transfers:write', 'Move stock between locations'], ['purchase_orders:write', 'Raise purchase orders'], ['suppliers:manage', 'Maintain suppliers']]],
  ['Merchandising', [['catalog:write', 'Create and edit products'], ['catalog:import', 'Upload and commit catalogue files'], ['catalog:publish', 'Publish the catalogue to channels'], ['pricing:write', 'Change prices'], ['promotions:write', 'Create promotions']]],
  ['Money and customers', [['refunds:request', 'Raise refunds'], ['refunds:approve', 'Approve refunds and payments within limit'], ['settlements:reconcile', 'Reconcile payments and settlements'], ['customers:read', 'View customer records (masked)'], ['cases:manage', 'Handle support cases']]],
  ['Decisions and oversight', [['approvals:decide', 'Approve or reject requests'], ['channels:suspend', 'Suspend a sales channel'], ['activity:own', 'View my own activity'], ['audit:area', 'Read the audit trail for my area'], ['audit:read', 'Read the full audit trail'], ['observability:read', 'Read integration health']]],
  ['Platform control', [['users:manage', 'Manage users and their roles'], ['settings:manage', 'Change stores, devices and rules'], ['connectors:manage', 'Connect and configure channels'], ['signin:manage', 'Change customer sign-in'], ['integrations:replay', 'Replay failed integration events']]],
];
const ALL = AREAS.flatMap(([, ps]) => ps.map(p => p[0]));
const LABEL = Object.fromEntries(AREAS.flatMap(([, ps]) => ps));
const CATS = [
  ['leadership', 'Leadership', 'business', ['orders:read', 'stock:read', 'audit:read', 'observability:read', 'approvals:decide', 'channels:suspend', 'customers:read', 'activity:own']],
  ['store', 'Store front line', 'stores', ['sales:write', 'discount:apply', 'returns:write', 'orders:read', 'refunds:request', 'activity:own']],
  ['fulfilment', 'Fulfilment and supply chain', 'business', ['orders:read', 'stock:read', 'audit:area', 'activity:own']],
  ['merch', 'Merchandising', 'business', ['catalog:write', 'stock:read', 'audit:area', 'activity:own']],
  ['back', 'Back office and customer care', 'business', ['orders:read', 'customers:read', 'audit:area', 'activity:own']],
  ['platform', 'Platform control', 'business', ['users:manage', 'settings:manage', 'connectors:manage', 'signin:manage', 'audit:read', 'observability:read', 'activity:own']],
];
const CAT = Object.fromEntries(CATS.map(c => [c[0], {label: c[1], scope: c[2], base: new Set(c[3])}]));
const ROLES = [
  ['tenant_owner', 'Business owner', 'leadership'], ['cashier', 'Cashier', 'store'], ['store_manager', 'Store manager', 'store'],
  ['oms_supervisor', 'OMS supervisor', 'fulfilment'], ['warehouse_supervisor', 'Warehouse supervisor', 'fulfilment'], ['logistics_supervisor', 'Logistics supervisor', 'fulfilment'],
  ['inventory_manager', 'Inventory manager', 'fulfilment'], ['procurement', 'Procurement', 'fulfilment'],
  ['catalog_manager', 'Catalogue manager', 'merch'], ['pricing_manager', 'Pricing and promotions', 'merch'],
  ['finance', 'Finance and accounts', 'back'], ['payment_approver', 'Payment approver', 'back'], ['customer_support', 'Customer support', 'back'], ['tenant_admin', 'Retail administrator', 'platform'],
];
const RL = Object.fromEntries(ROLES.map(r => [r[0], r[1]]));
const RC = Object.fromEntries(ROLES.map(r => [r[0], r[2]]));
const PERSONA_ROLE = {owner: 'tenant_owner', manager: 'store_manager', cashier: 'cashier', oms: 'oms_supervisor', inventory: 'inventory_manager', warehouse: 'warehouse_supervisor',
  logistics: 'logistics_supervisor', admin: 'tenant_admin', support: 'customer_support', finance: 'finance', procurement: 'procurement', pricing: 'pricing_manager', catalogue: 'catalog_manager', payments: 'payment_approver'};
const STORES = ['Ulundurpet Main Store', 'Kallakurichi Store', 'Villupuram DC'];
const DEFAULT_EXTRAS = {
  cashier: [], store_manager: ['shift:close', 'orders:write', 'approvals:decide', 'inventory:write', 'inventory:sync', 'delivery:write', 'stock:read', 'audit:area', 'refunds:approve'],
  oms_supervisor: ['orders:write', 'sourcing:write', 'approvals:decide'], warehouse_supervisor: ['shipments:write', 'transfers:write', 'inventory:write'],
  logistics_supervisor: ['delivery:write', 'riders:manage', 'observability:read'], inventory_manager: ['inventory:write', 'inventory:sync', 'transfers:write', 'approvals:decide'],
  procurement: ['purchase_orders:write', 'suppliers:manage'], catalog_manager: ['catalog:import', 'catalog:publish'], pricing_manager: ['pricing:write', 'promotions:write'],
  finance: ['settlements:reconcile', 'observability:read'], payment_approver: ['refunds:approve'], customer_support: ['cases:manage', 'refunds:request'],
  tenant_admin: ['integrations:replay'],
};
const DEFAULT_LIMITS = {cashier: {discount: 10}, store_manager: {discount: 20, refund: 2000}, payment_approver: {refund: 10000}};
const OWNER_SECOND_APPROVER_ABOVE = 25000;   // compensating control for the owner's unlimited rights
const MFA_ROLES = new Set(['tenant_owner', 'tenant_admin', 'store_manager', 'finance', 'payment_approver']);
// Permission pairs one role must not combine (configure versus decide; buy versus pay; price versus reconcile).
const ROLE_RULES = [
  [['users:manage', 'settings:manage'], ['approvals:decide', 'refunds:approve'], 'would both configure the system and approve exceptions or refunds'],
  [['purchase_orders:write'], ['settlements:reconcile', 'refunds:approve'], 'would raise purchase orders and also reconcile or release payments'],
  [['pricing:write'], ['settlements:reconcile'], 'would set prices and also reconcile the takings'],
  [['refunds:approve'], ['settlements:reconcile'], 'would approve payments and also reconcile them'],
];
// Role pairs one person must not hold (the business owner is exempt).
const USER_RULES = [['procurement', 'payment_approver', 'raising purchase orders and paying suppliers'], ['tenant_admin', 'payment_approver', 'creating users and releasing money'], ['finance', 'payment_approver', 'approving payments and reconciling them'],
  ['procurement', 'finance', 'raising purchase orders and reconciling their payment'], ['tenant_admin', 'finance', 'creating users and handling money'],
  ['pricing_manager', 'finance', 'setting prices and reconciling takings'], ['cashier', 'store_manager', 'approving their own counter’s exceptions']];

const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000).toISOString().slice(0, 10);
const fmt = d => d ? new Date(d).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}) : '—';
const policy0 = () => ({version: 1, extras: clone(DEFAULT_EXTRAS), limits: clone(DEFAULT_LIMITS)});
const ago = n => addDays(today(), -n);
const users0 = () => [
  {id: 'U1', name: 'Kavya', email: 'kavya@aifirstmart.example', roles: ['cashier'], stores: ['Ulundurpet Main Store'], limits: {discount: 10}, status: 'Active', lastSignIn: ago(0), temp: []},
  {id: 'U2', name: 'Raj', email: 'raj@aifirstmart.example', roles: ['store_manager'], stores: ['Ulundurpet Main Store'], limits: {discount: 20, refund: 2000}, status: 'Active', lastSignIn: ago(0), temp: []},
  {id: 'U3', name: 'Arun', email: 'arun@aifirstmart.example', roles: ['oms_supervisor'], stores: [], limits: {}, status: 'Active', lastSignIn: ago(1), temp: []},
  {id: 'U4', name: 'Meena', email: 'meena@aifirstmart.example', roles: ['inventory_manager'], stores: [], limits: {}, status: 'Active', lastSignIn: ago(2), temp: []},
  {id: 'U5', name: 'Lakshmi', email: 'lakshmi@aifirstmart.example', roles: ['tenant_admin'], stores: [], limits: {}, status: 'Active', lastSignIn: ago(0), temp: []},
  {id: 'U6', name: 'Anitha', email: 'anitha@aifirstmart.example', roles: ['finance'], stores: [], limits: {}, status: 'Active', lastSignIn: ago(3), temp: []},
  {id: 'U9', name: 'Kumar', email: 'kumar@aifirstmart.example', roles: ['payment_approver'], stores: [], limits: {refund: 10000}, status: 'Active', lastSignIn: ago(5), temp: []},
  {id: 'U7', name: 'Bala', email: 'bala@aifirstmart.example', roles: ['procurement'], stores: [], limits: {}, status: 'Active', lastSignIn: ago(124), temp: []},
];
const fresh = () => ({published: policy0(), draft: policy0(), users: users0(), tab: 'roles', lastRefusal: '', pending: null, review: {last: ago(220), reviewing: null}});
let S; try { S = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { S = null; }
if (!S || !S.published) S = fresh();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const persona = () => { try { return session.activePersona; } catch (e) { return ''; } };
const ME = {admin: 'U5', manager: 'U2', cashier: 'U1', oms: 'U3', inventory: 'U4', finance: 'U6', procurement: 'U7', payments: 'U9'};
const myName = () => persona() === 'owner' ? 'Business owner' : (S.users.find(u => u.id === ME[persona()])?.name || persona());
const effRoles = u => [...new Set([...u.roles, ...(u.temp || []).filter(t => t.until >= today()).map(t => t.role)])];

// ---------------- policy evaluation
const permsOf = (pol, role) => role === 'tenant_owner' ? new Set(ALL) : new Set([...CAT[RC[role]].base, ...(pol.extras[role] || [])]);
const isBase = (role, perm) => role === 'tenant_owner' || CAT[RC[role]].base.has(perm);
function roleConflicts(pol) {
  const out = [];
  for (const [r] of ROLES) {
    if (r === 'tenant_owner') continue;
    const ps = permsOf(pol, r);
    for (const [a, b, why] of ROLE_RULES) {
      const pa = a.filter(x => ps.has(x)), pb = b.filter(x => ps.has(x));
      if (pa.length && pb.length) out.push({role: r, perms: [...pa, ...pb], text: `${RL[r]} ${why} (${[...pa, ...pb].map(p => LABEL[p]).join(' + ')}).`});
    }
  }
  return out;
}
function diff() {
  const ch = [];
  for (const [r] of ROLES) {
    if (r === 'tenant_owner') continue;
    const a = new Set(S.published.extras[r] || []), b = new Set(S.draft.extras[r] || []);
    for (const p of b) if (!a.has(p)) ch.push(`${RL[r]}: add “${LABEL[p]}”`);
    for (const p of a) if (!b.has(p)) ch.push(`${RL[r]}: remove “${LABEL[p]}”`);
    for (const k of ['discount', 'refund']) {
      const x = S.published.limits[r]?.[k], y = S.draft.limits[r]?.[k];
      if (x !== y) ch.push(`${RL[r]}: ${k === 'discount' ? 'discount ceiling' : 'refund ceiling'} ${x ?? '—'} → ${y ?? '—'}${k === 'discount' ? '%' : ''}`);
    }
  }
  return ch;
}
function can(perm, who = persona()) {
  const role = PERSONA_ROLE[who];
  return !!role && permsOf(S.published, role).has(perm);
}
const ceiling = (roles, k, pol = S.published) => roles.some(r => r === 'tenant_owner') ? Infinity : Math.max(0, ...roles.map(r => pol.limits[r]?.[k] ?? 0));
const storeLevel = roles => roles.length && roles.every(r => CAT[RC[r]].scope === 'stores');

// ---------------- lifecycle housekeeping (runs on load and every few seconds)
function housekeeping() {
  let changed = false;
  for (const u of S.users) {
    const expired = (u.temp || []).filter(t => t.until < today());
    if (expired.length) { u.temp = u.temp.filter(t => t.until >= today()); expired.forEach(t => audit('Temporary access expired', `${u.name} · ${RL[t.role]} ended ${fmt(t.until)}`)); changed = true; }
    if (u.status === 'Active' && u.lastSignIn && daysBetween(u.lastSignIn, today()) > 90) { u.status = 'Disabled · inactive 90+ days'; audit('User disabled for inactivity', `${u.name} · last sign-in ${fmt(u.lastSignIn)}`); changed = true; }
  }
  if (changed) { save(); render(); }
}

// ---------------- rendering
function mount() {
  try { for (const p of ['admin', 'owner']) if (PERSONAS[p] && !PERSONAS[p].nav.includes('policy')) PERSONAS[p].nav.push('policy'); } catch (e) {}
  const side = q('#side');
  if (side && !side.querySelector('[data-nav="policy"]')) {
    const after = side.querySelector('[data-nav="signin"]') || [...side.querySelectorAll('.navbtn')].pop();
    after?.insertAdjacentHTML('afterend', '<button class="navbtn" data-nav="policy">⚖ <span>Access policy</span></button>');
  }
  const host = q('#setup')?.parentElement;
  if (host && !q('#policy')) host.insertAdjacentHTML('beforeend', '<section class="screen" id="policy"></section>');
  housekeeping(); render();
}
const editable = () => can('users:manage') && !S.pending;
const isOwner = () => persona() === 'owner';
function cell(role, perm) {
  const pol = S.draft, base = isBase(role, perm), on = permsOf(pol, role).has(perm);
  const bad = roleConflicts(pol).some(c => c.role === role && c.perms.includes(perm));
  const style = `text-align:center;${bad ? 'background:#fde2e1' : ''}`;
  if (base) return `<td style="${style}" title="From the ${CAT[RC[role]].label} baseline" data-pcell="${role}:${perm}">✓</td>`;
  return `<td style="${style}" data-pcell="${role}:${perm}"><input type="checkbox" data-perm="${role}:${perm}" ${on ? 'checked' : ''} ${editable() ? '' : 'disabled'} aria-label="${esc(RL[role])}: ${esc(LABEL[perm])}"></td>`;
}
function publishCard() {
  const conf = roleConflicts(S.draft), ch = diff(), P = S.pending;
  if (P) return `<div class="card panel" id="policyPublish"><h2>Awaiting owner approval · version ${P.version}</h2>
    <p>Submitted by <b>${esc(P.by)}</b> on ${fmt(P.at)}. Changes: ${P.changes.map(esc).join('; ')}</p>
    ${isOwner() ? '<div class="actions"><button class="btn" id="policyReject">Reject</button><button class="btn primary" id="policyApprove">Approve and publish</button></div>'
      : '<p>The draft is locked until the owner approves or rejects it. Nobody can approve their own policy change.</p>'}</div>`;
  const label = isOwner() ? 'Publish policy' : 'Submit for owner approval';
  return `<div class="card panel" id="policyPublish"><h2>Draft policy · published version ${S.published.version}</h2>
    ${conf.length ? `<div id="policyConflicts" style="background:#fde2e1;padding:8px 10px;border-radius:8px"><b>Cannot publish:</b> ${conf.map(c => esc(c.text)).join(' ')}</div>` : ''}
    <p>${ch.length ? `<b>${ch.length} unpublished change${ch.length > 1 ? 's' : ''}:</b> ${ch.map(esc).join('; ')}` : 'No unpublished changes.'}</p>
    ${can('users:manage') ? `<div class="actions"><button class="btn" id="policyDiscard" ${ch.length ? '' : 'disabled style="opacity:.45"'}>Discard changes</button><button class="btn primary" id="policyPublishBtn" ${ch.length && !conf.length ? '' : 'disabled style="opacity:.45;cursor:not-allowed"'}>${label}</button></div>` : '<p>View only for your role.</p>'}</div>`;
}
function rolesTab() {
  const pol = S.draft, ed = editable();
  const catHead = CATS.map(([k, l]) => `<th colspan="${ROLES.filter(r => r[2] === k).length}" style="text-align:center;border-bottom:2px solid var(--line,#ddd)">${esc(l)}</th>`).join('');
  const roleHead = ROLES.map(([r, l]) => `<th style="min-width:86px;text-align:center;font-size:12px">${esc(l)}</th>`).join('');
  const body = AREAS.map(([area, ps]) => `<tr><td colspan="${ROLES.length + 1}" style="background:var(--soft,#f3f7f6);font-weight:700">${esc(area)}</td></tr>` +
    ps.map(([p, l]) => `<tr><td style="position:sticky;left:0;background:var(--card,#fff);min-width:230px">${esc(l)}</td>${ROLES.map(([r]) => cell(r, p)).join('')}</tr>`).join('')).join('');
  const limitRow = (k, label, unit) => `<tr><td style="position:sticky;left:0;background:var(--card,#fff)"><b>${label}</b></td>${ROLES.map(([r]) => {
    if (r === 'tenant_owner') return `<td style="text-align:center;font-size:12px">${k === 'refund' ? 'Second approver above ₹' + OWNER_SECOND_APPROVER_ABOVE.toLocaleString('en-IN') : 'No ceiling'}</td>`;
    const v = pol.limits[r]?.[k]; const relevant = (k === 'discount' && permsOf(pol, r).has('discount:apply')) || (k === 'refund' && permsOf(pol, r).has('refunds:approve'));
    return relevant ? `<td style="text-align:center"><input data-limit="${r}:${k}" value="${v ?? 0}" style="width:64px" inputmode="numeric" ${ed ? '' : 'disabled'}> ${unit}</td>` : '<td></td>';
  }).join('')}</tr>`;
  const scopeRow = `<tr><td style="position:sticky;left:0;background:var(--card,#fff)"><b>Scope</b></td>${ROLES.map(([r]) => `<td style="text-align:center">${CAT[RC[r]].scope === 'stores' ? 'Assigned stores' : 'Whole business'}</td>`).join('')}</tr>`;
  const mfaRow = `<tr><td style="position:sticky;left:0;background:var(--card,#fff)"><b>Second sign-in step</b></td>${ROLES.map(([r]) => `<td style="text-align:center">${MFA_ROLES.has(r) ? 'Required' : '—'}</td>`).join('')}</tr>`;
  return `${publishCard()}
    <div class="card panel"><h2>Roles and permissions</h2><p>✓ comes from the role’s category baseline and cannot be removed here. Tick boxes are the role’s own additions. Limits are ceilings: a user’s own limit can be lower, never higher.</p>
    <div style="overflow-x:auto;max-height:70vh" id="permMatrix"><table class="table" style="font-size:13px"><thead><tr><th rowspan="2" style="position:sticky;left:0;background:var(--card,#fff)">Permission</th>${catHead}</tr><tr>${roleHead}</tr></thead>
    <tbody>${body}<tr><td colspan="${ROLES.length + 1}" style="background:var(--soft,#f3f7f6);font-weight:700">Limits, scope and sign-in</td></tr>${limitRow('discount', 'Discount ceiling', '%')}${limitRow('refund', 'Refund ceiling', '₹')}${scopeRow}${mfaRow}</tbody></table></div>
    <p>The audit trail is read-only and kept for at least 180 days.</p></div>`;
}
function reviewCard() {
  const due = addDays(S.review.last, 182), over = due < today(), R = S.review.reviewing;
  const active = S.users.filter(u => u.status === 'Active');
  if (R) { const left = active.filter(u => !R.includes(u.id)).length;
    return `<div class="card panel" id="reviewCard"><h2>Access review in progress</h2><p>Confirm each person still needs every role, store and limit shown, or change it first. <b>${left}</b> left to confirm.</p>
      <div class="actions"><button class="btn primary" id="reviewDone" ${left ? 'disabled style="opacity:.45"' : ''}>Complete review</button></div></div>`; }
  return `<div class="card panel" id="reviewCard" style="${over ? 'border:2px solid #d1242f' : ''}"><h2>Access review</h2><p>Last completed ${fmt(S.review.last)} · next due ${fmt(due)}${over ? ' · <b style="color:#d1242f">overdue</b>' : ''}. Every user’s access is reviewed at least every six months.</p>
    ${can('users:manage') ? '<div class="actions"><button class="btn" id="reviewStart">Start access review</button></div>' : ''}</div>`;
}
function usersTab() {
  const ed = can('users:manage'), R = S.review.reviewing;
  const head = ROLES.map(([r, l]) => `<th style="min-width:80px;text-align:center;font-size:12px">${esc(l)}</th>`).join('');
  const rows = S.users.map(u => {
    const eff = effRoles(u), dc = ceiling(eff, 'discount'), rc = ceiling(eff, 'refund'), mine = u.id === ME[persona()];
    const dis = !ed || mine || u.status.startsWith('Disabled') ? 'disabled' : '';
    const lim = [dc > 0 ? `Discount <input data-ulimit="${u.id}:discount" value="${u.limits.discount ?? ''}" style="width:46px" ${dis}>%${dc !== Infinity ? ` (max ${dc})` : ''}` : '',
      rc > 0 ? `Refund ₹<input data-ulimit="${u.id}:refund" value="${u.limits.refund ?? ''}" style="width:64px" ${dis}>${rc !== Infinity ? ` (max ${rc})` : ''}` : ''].filter(Boolean).join('<br>') || '—';
    const temp = (u.temp || []).map(t => `<span class="badge warn">${esc(RL[t.role])} until ${fmt(t.until)}</span>`).join(' ');
    const rev = R && u.status === 'Active' ? (R.includes(u.id) ? '<span class="badge">Confirmed</span>' : `<button class="btn" data-review="${u.id}">Confirm</button>`) : '';
    return `<tr data-user="${u.id}"><td style="position:sticky;left:0;background:var(--card,#fff);min-width:160px"><b>${esc(u.name)}</b>${mine ? ' <small>(you)</small>' : ''}<br><small>${esc(u.email)}</small></td>
      ${ROLES.map(([r]) => `<td style="text-align:center"><input type="checkbox" data-urole="${u.id}:${r}" ${u.roles.includes(r) ? 'checked' : ''} ${dis} aria-label="${esc(u.name)}: ${esc(RL[r])}"></td>`).join('')}
      <td style="min-width:190px">${STORES.map(st => `<label style="display:block;white-space:nowrap"><input type="checkbox" data-ustore="${u.id}:${st}" ${u.stores.includes(st) ? 'checked' : ''} ${dis}> ${esc(st)}</label>`).join('')}</td>
      <td style="min-width:150px">${lim}</td>
      <td style="min-width:170px">${temp || '—'}${ed && !dis ? `<br><button class="link" data-temp="${u.id}">Grant temporary role</button>` : ''}</td>
      <td>${eff.some(r => MFA_ROLES.has(r)) ? 'Required' : '—'}</td><td>${fmt(u.lastSignIn)}</td><td>${esc(u.status)}</td><td>${rev}</td></tr>`;
  }).join('');
  return `${reviewCard()}<div class="card panel"><h2>Users and roles</h2><p>Tick the roles each person holds. Store-level roles need at least one store; conflicting roles are refused; limits cannot exceed the role’s ceiling; nobody can change their own access. Every change is recorded in the audit trail.</p>
    ${S.lastRefusal ? `<p id="userRefusal" style="background:#fde2e1;padding:8px 10px;border-radius:8px">${esc(S.lastRefusal)}</p>` : ''}
    ${ed ? '<div class="actions"><button class="btn" id="userAdd">＋ Add user</button></div>' : ''}
    <div style="overflow-x:auto" id="userMatrix"><table class="table" style="font-size:13px"><thead><tr><th style="position:sticky;left:0;background:var(--card,#fff)">User</th>${head}<th>Stores</th><th>Own limits</th><th>Temporary access</th><th>Second step</th><th>Last sign-in</th><th>Status</th><th>Review</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function render() {
  const el = q('#policy'); if (!el) return;
  const sx = q('#permMatrix')?.scrollLeft || 0, ux = q('#userMatrix')?.scrollLeft || 0;
  el.innerHTML = `<div class="pagehead"><div><h1>Access policy</h1><p>Step 1: set what each role may do. Step 2: give people their roles.</p></div></div>
    <div class="actions" style="margin-bottom:10px"><button class="btn${S.tab === 'roles' ? ' primary' : ''}" data-ptab="roles">1. Roles and permissions</button><button class="btn${S.tab === 'users' ? ' primary' : ''}" data-ptab="users">2. Users and roles</button></div>
    ${S.tab === 'roles' ? rolesTab() : usersTab()}`;
  if (q('#permMatrix')) q('#permMatrix').scrollLeft = sx;
  if (q('#userMatrix')) q('#userMatrix').scrollLeft = ux;
}

// ---------------- actions
function refuse(msg) { S.lastRefusal = msg; save(); render(); toast(msg); }
function capLimits() {
  const capped = [];
  for (const u of S.users) for (const k of ['discount', 'refund']) {
    const c = ceiling(effRoles(u), k);
    if (u.limits[k] != null && u.limits[k] > c) { capped.push(`${u.name} ${k} ${u.limits[k]} → ${c}`); u.limits[k] = c; }
  }
  if (capped.length) audit('User limits capped', capped.join('; '));
  return capped;
}
function doPublish(changes, approvedBy) {
  S.published = clone(S.draft); S.published.version += 1; S.draft = clone(S.published); S.pending = null;
  audit('Access policy published', `version ${S.published.version} · ${approvedBy} · ${changes.join('; ')}`);
  const capped = capLimits(); save(); render();
  toast(`Policy version ${S.published.version} published${capped.length ? '; ' + capped.length + ' user limit capped' : ''}`);
}
function publishDialog() {
  const ch = diff(), owner = isOwner();
  open(owner ? 'Publish access policy' : 'Submit access policy', `<p>Version ${S.published.version} → ${S.published.version + 1}. These changes apply to every user with the role${owner ? ' as soon as you publish' : ' once the owner approves'}:</p><ul>${ch.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`,
    footer('policyConfirm', owner ? 'Publish policy' : 'Submit for approval'));
  q('#policyConfirm').onclick = () => {
    if (roleConflicts(S.draft).length) { close(); return toast('Resolve the conflicts first'); }
    if (owner) { close(); return doPublish(ch, 'published by the owner'); }
    S.pending = {version: S.published.version + 1, changes: ch, by: myName(), at: today()};
    audit('Access policy submitted', `version ${S.pending.version} · by ${S.pending.by} · ${ch.join('; ')}`); save(); close(); render(); toast('Submitted for the owner’s approval');
  };
}
function tempDialog(u) {
  open(`Grant temporary role · ${u.name}`, `<div class="field"><label>Role</label><select id="tmpRole">${ROLES.filter(([r]) => r !== 'tenant_owner' && !u.roles.includes(r)).map(([r, l]) => `<option value="${r}">${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label>Ends on (at most 30 days)</label><input id="tmpUntil" type="date" value="${addDays(today(), 7)}" min="${addDays(today(), 1)}" max="${addDays(today(), 30)}"></div><div class="field"><label>Reason</label><input id="tmpWhy" placeholder="For example: covering leave"></div>
    <p>Temporary access ends automatically on the date shown. The same conflict and store rules apply.</p>`, footer('tmpSave', 'Grant'));
  q('#tmpSave').onclick = () => {
    const role = q('#tmpRole').value, until = q('#tmpUntil').value, why = q('#tmpWhy').value.trim();
    if (!until || until <= today() || daysBetween(today(), until) > 30) return toast('Choose an end date within the next 30 days');
    if (!why) return toast('Enter the reason');
    const roles = [...effRoles(u), role], c = USER_RULES.find(([a, b]) => roles.includes(a) && roles.includes(b));
    if (c) { close(); return refuse(`Refused: ${u.name} cannot hold ${RL[c[0]]} with ${RL[c[1]]} (${c[2]}), not even temporarily.`); }
    if (CAT[RC[role]].scope === 'stores' && !u.stores.length) { close(); return refuse(`Refused: ${RL[role]} is a store-level role. Tick a store for ${u.name} first.`); }
    u.temp = [...(u.temp || []), {role, until, why}]; S.lastRefusal = '';
    audit('Temporary access granted', `${u.name} · ${RL[role]} until ${fmt(until)} · ${why}`); save(); close(); render(); toast(`${RL[role]} granted until ${fmt(until)}`);
  };
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ptab]');
  if (t) { S.tab = t.dataset.ptab; save(); return render(); }
  if (e.target.closest('#policyPublishBtn')) { if (!editable()) return; return publishDialog(); }
  if (e.target.closest('#policyApprove')) {
    if (!isOwner() || !S.pending) return;
    if (S.pending.by === myName()) return toast('You cannot approve your own change');
    return doPublish(S.pending.changes, `approved by the owner, submitted by ${S.pending.by}`);
  }
  if (e.target.closest('#policyReject')) {
    if (!isOwner() || !S.pending) return;
    audit('Access policy rejected', `version ${S.pending.version} · submitted by ${S.pending.by}`); S.pending = null; save(); render(); return toast('Change rejected; the draft is unlocked');
  }
  if (e.target.closest('#policyDiscard')) { if (!editable()) return; S.draft = clone(S.published); save(); render(); return toast('Draft discarded'); }
  if (e.target.closest('#reviewStart')) { if (!can('users:manage')) return; S.review.reviewing = []; audit('Access review started', `${S.users.filter(u => u.status === 'Active').length} active users`); save(); return render(); }
  const rv = e.target.closest('[data-review]');
  if (rv && S.review.reviewing) { const u = S.users.find(x => x.id === rv.dataset.review); S.review.reviewing.push(u.id); audit('Access confirmed in review', `${u.name} · ${effRoles(u).map(r => RL[r]).join(', ') || 'no roles'}`); save(); return render(); }
  if (e.target.closest('#reviewDone')) { S.review = {last: today(), reviewing: null}; audit('Access review completed', `next due ${fmt(addDays(today(), 182))}`); save(); render(); return toast('Access review completed'); }
  const tp = e.target.closest('[data-temp]');
  if (tp) { const u = S.users.find(x => x.id === tp.dataset.temp); if (u.id === ME[persona()]) return refuse('Refused: you cannot change your own access. Ask the owner.'); return tempDialog(u); }
  if (e.target.closest('#userAdd')) {
    if (!can('users:manage')) return;
    open('Add user', '<div class="field"><label>Name</label><input id="puName"></div><div class="field"><label>Email</label><input id="puEmail"></div><p>The user starts with no roles. Give them roles in the matrix.</p>', footer('puSave', 'Add user'));
    q('#puSave').onclick = () => {
      const name = q('#puName').value.trim(), email = q('#puEmail').value.trim().toLowerCase();
      if (!name) return toast('Enter a name');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('Enter a valid email address');
      if (S.users.some(u => u.email === email)) return toast('A user with this email already exists');
      S.users.push({id: 'U' + (S.users.length + 1) + Date.now() % 1000, name, email, roles: [], stores: [], limits: {}, status: 'Active', lastSignIn: today(), temp: []});
      audit('User added', `${name} · ${email} · no roles yet`); S.lastRefusal = ''; save(); close(); render(); toast('User added');
    };
  }
}, false);
document.addEventListener('change', e => {
  const f = e.target;
  if (f.dataset.perm) {
    if (!editable()) return render();
    const i = f.dataset.perm.indexOf(':'), r = f.dataset.perm.slice(0, i), p = f.dataset.perm.slice(i + 1);
    const set = new Set(S.draft.extras[r] || []); f.checked ? set.add(p) : set.delete(p);
    S.draft.extras[r] = [...set]; save(); return render();
  }
  if (f.dataset.limit) {
    if (!editable()) return render();
    const [r, k] = f.dataset.limit.split(':'); const v = Number(f.value);
    const max = k === 'discount' ? 100 : 100000;
    if (!(v >= 0 && v <= max) || !Number.isInteger(v)) { toast(`Enter a whole number from 0 to ${max}`); return render(); }
    S.draft.limits[r] = {...(S.draft.limits[r] || {}), [k]: v}; save(); return render();
  }
  const key = f.dataset.urole || f.dataset.ustore || f.dataset.ulimit;
  if (!key) return;
  if (!can('users:manage')) return render();
  const id = key.slice(0, key.indexOf(':')), rest = key.slice(key.indexOf(':') + 1), u = S.users.find(x => x.id === id);
  if (id === ME[persona()]) return refuse('Refused: you cannot change your own access. Ask the owner.');
  if (f.dataset.urole) {
    const r = rest, roles = f.checked ? [...new Set([...u.roles, r])] : u.roles.filter(x => x !== r), eff = [...new Set([...roles, ...effRoles(u).filter(x => !u.roles.includes(x))])];
    if (f.checked && !eff.includes('tenant_owner')) {
      const c = USER_RULES.find(([a, b]) => eff.includes(a) && eff.includes(b));
      if (c) return refuse(`Refused: ${u.name} cannot hold ${RL[c[0]]} with ${RL[c[1]]} (${c[2]}).`);
      if (CAT[RC[r]].scope === 'stores' && !u.stores.length) return refuse(`Refused: ${RL[r]} is a store-level role. Tick at least one store for ${u.name} first.`);
    }
    const before = u.roles.map(x => RL[x]).join(', ') || 'none';
    u.roles = roles;
    for (const k of ['discount', 'refund']) { const c = ceiling(effRoles(u), k); if (u.limits[k] != null && c !== Infinity && u.limits[k] > c) u.limits[k] = c; if (c > 0 && c !== Infinity && u.limits[k] == null) u.limits[k] = c; }
    S.lastRefusal = ''; audit('User roles changed', `${u.name} · ${before} → ${u.roles.map(x => RL[x]).join(', ') || 'none'}`); save(); return render();
  }
  if (f.dataset.ustore) {
    const stores = f.checked ? [...new Set([...u.stores, rest])] : u.stores.filter(x => x !== rest);
    if (!stores.length && storeLevel(effRoles(u))) return refuse(`Refused: ${u.name}’s ${effRoles(u).map(x => RL[x]).join(', ')} role needs at least one store.`);
    u.stores = stores; S.lastRefusal = ''; audit('User stores changed', `${u.name} · ${stores.join(', ') || 'none'}`); save(); return render();
  }
  if (f.dataset.ulimit) {
    const k = rest, v = Number(f.value), c = ceiling(effRoles(u), k);
    if (!(v >= 0) || !Number.isFinite(v)) return refuse('Enter a number of 0 or more.');
    if (v > c) return refuse(`Refused: ${u.name}’s ${k} limit cannot be above the role ceiling of ${c}${k === 'discount' ? '%' : ''}.`);
    const before = u.limits[k]; u.limits[k] = v; S.lastRefusal = '';
    audit('User limit changed', `${u.name} · ${k} ${before ?? '—'} → ${v}${k === 'discount' ? '%' : ''}`); save(); return render();
  }
}, false);

function ensure() {
  if (!q('#side [data-nav="policy"]') || !q('#policy')) mount();
  const b = q('#side [data-nav="policy"]'); if (b) b.classList.toggle('persona-denied', !['admin', 'owner'].includes(persona()));
  const sec = q('#policy'); if (sec && sec.classList.contains('active') && !['admin', 'owner'].includes(persona())) { sec.classList.remove('active'); q('#command')?.classList.add('active'); }
  if (sec && sec.dataset.who !== persona()) { sec.dataset.who = persona(); render(); }
}
window.AFMPolicy = {can, state: () => S, reset: () => { S = fresh(); save(); housekeeping(); render(); }, render, roleConflicts: () => roleConflicts(S.draft), effRoles};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
setInterval(ensure, 300);
setInterval(housekeeping, 5000);
})();

