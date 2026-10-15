// ================================================================ roles
function addPersonas() {
  try {
    if (!PERSONAS.payments) PERSONAS.payments = {label: 'Payment approver', home: 'refunds', scope: 'All stores · refunds and payments', nav: ['command', 'refunds', 'audit'], permissions: ['audit.view'],
      summary: 'Approves refunds and supplier payments within a set limit. Never reconciles them.', metrics: [['Refunds waiting', '4', 'Oldest 2 days'], ['Your limit', '₹10,000', 'Per refund'], ['Above limit', '1', 'Owner decides'], ['Approved today', '0', '']],
      work: [['Refund queue', 'Customer refunds waiting for approval', 'refunds']]};
    if (!PERSONAS.customer) PERSONAS.customer = {label: 'Customer (shop view)', home: 'shop', scope: 'Shopper on web, app and WhatsApp', nav: ['shop'], permissions: [],
      summary: 'What a shopper sees: browse, cart, checkout, tracking and returns.', metrics: [], work: []};
    const NO_TR = !!window.AFM_NO_TRAINING;  // platform-only build: no training screens
    // Command center process panel for the payment approver (business-processes falls back to from/to for roles it does not list)
    if (typeof BUSINESS_FLOWS !== 'undefined' && !BUSINESS_FLOWS.payments) BUSINESS_FLOWS.payments = {
      purpose: 'Approve refunds and supplier payments within your limit, never your own.', from: 'Stores + Customer support', to: 'Finance',
      inbound: 'Refund and payment requests from stores, support and customers', outbound: 'Approved refunds for Finance to reconcile',
      steps: [['Review the queue', 'refunds', 'Check the amount, the reason and who asked.'], ['Approve within your limit', 'refunds', 'Approve or reject; larger amounts go to the owner.'],
        ['Countersign large refunds', 'refunds', 'A second person confirms refunds above ₹25,000.'], ['Hand over to Finance', 'refunds', 'Approved refunds wait for reconciliation.'],
        ['Check the record', 'audit', 'Every decision is in the audit trail.']]};
    for (const [p, ids] of Object.entries({owner: NO_TR ? ['refunds'] : ['refunds', 'records'], admin: NO_TR ? [] : ['records'], manager: ['refunds'], finance: ['refunds']}))
      if (PERSONAS[p]) for (const id of ids) if (!PERSONAS[p].nav.includes(id)) PERSONAS[p].nav.push(id);
    const sel = q('#personaSelect');
    if (sel && !sel.querySelector('option[value="payments"]')) {
      sel.insertAdjacentHTML('beforeend', '<option value="payments">Payment approver</option><option value="customer">Customer (shop view)</option>');
      const saved = localStorage.getItem('afm-persona'); if (saved && sel.value !== saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;
    }
  } catch (e) {}
}
function mountScreens() {
  addPersonas();
  const side = q('#side'), host = q('#setup')?.parentElement;
  const NAV = [['refunds', '₹', 'Refunds & payments'], ['shop', '🛍', 'Customer shop'], ['records', '🎓', 'Training records']].filter(n => !(window.AFM_NO_TRAINING && n[0] === 'records'));
  if (side) for (const [id, icon, label] of NAV) if (!side.querySelector(`[data-nav="${id}"]`)) {
    const last = [...side.querySelectorAll('.navbtn')].pop();
    (last || side).insertAdjacentHTML(last ? 'afterend' : 'beforeend', `<button class="navbtn" data-nav="${id}">${icon} <span>${label}</span></button>`);
  }
  if (host) for (const [id] of NAV) if (!q('#' + id)) host.insertAdjacentHTML('beforeend', `<section class="screen" id="${id}"></section>`);
  try { applyPersonaNav(); } catch (e) {}
}

