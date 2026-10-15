// ================================================================ refunds and payments
const RF_KEY = 'afm-refunds-v1';
const rf0 = () => ({items: [
  {id: 'RF-501', ref: 'REF-4412 · AFM-WEB-7162', reason: 'Gateway charged twice', amount: 238, by: 'Senthil · Customer support', status: 'Pending', log: []},
  {id: 'RF-502', ref: 'RET-1094 · AFM-POS-1082', reason: 'Damaged atta pack returned', amount: 1850, by: 'Raj', status: 'Pending', log: []},
  {id: 'RF-503', ref: 'CAN-2038 · AFM-WA-8817', reason: 'Bulk order cancelled before dispatch', amount: 8400, by: 'Senthil · Customer support', status: 'Pending', log: []},
  {id: 'RF-504', ref: 'CAN-2041 · Corporate gifting', reason: 'Corporate order cancelled by customer', amount: 32000, by: 'Senthil · Customer support', status: 'Pending', log: []},
]});
let RF = load(RF_KEY, rf0);
const saveRF = () => store(RF_KEY, RF);
const OWNER_SECOND_ABOVE = 25000;
function myLimit() {
  if (persona() === 'owner') return Infinity;
  const u = meUser(); if (!u) return 0;
  return Number(u.limits?.refund ?? 0);
}
function decideRefund(id, approve, reason = '') {
  const r = RF.items.find(x => x.id === id); if (!r) return;
  const me = meName(), p = persona();
  if (!pcan('refunds:approve')) return say(p === 'finance' ? 'Finance reconciles refunds but cannot approve them' : 'Your role cannot approve refunds');
  if (r.by.split(' · ')[0] === me) return say('Refused: you cannot approve a refund you requested');
  if (!approve) { r.status = 'Rejected'; r.log.push(`${nowT()} · rejected by ${me}: ${reason}`); audit('Refunds', 'Refund rejected', `${r.id} · ${rs(r.amount)} · ${me} · ${reason}`); saveRF(); renderRefunds(); return say(`${r.id} rejected`); }
  if (r.status === 'Awaiting second approver') {
    if (r.first === me) return say('Refused: the second approver must be a different person');
    r.status = 'Approved · awaiting reconciliation'; r.second = me; r.log.push(`${nowT()} · countersigned by ${me}`);
    audit('Refunds', 'Refund countersigned', `${r.id} · ${rs(r.amount)} · ${me}`); saveRF(); renderRefunds(); return say(`${r.id} approved by two people`);
  }
  if (r.amount > myLimit()) return say(`Refused: ${rs(r.amount)} is above your refund limit of ${rs(myLimit())}. The business owner decides this one`);
  if (p === 'owner' && r.amount > OWNER_SECOND_ABOVE) {
    r.status = 'Awaiting second approver'; r.first = me; r.log.push(`${nowT()} · approved by ${me}; second approver needed above ${rs(OWNER_SECOND_ABOVE)}`);
    audit('Refunds', 'Refund first approval', `${r.id} · ${rs(r.amount)} · ${me}`); saveRF(); renderRefunds(); return say('Approved. A second approver must countersign above ₹25,000');
  }
  r.status = 'Approved · awaiting reconciliation'; r.first = me; r.log.push(`${nowT()} · approved by ${me}`);
  audit('Refunds', 'Refund approved', `${r.id} · ${rs(r.amount)} · ${me}`); saveRF(); renderRefunds(); say(`${r.id} approved`);
}
function reconcileRefund(id, gatewayRef) {
  const r = RF.items.find(x => x.id === id); if (!r) return;
  if (!pcan('settlements:reconcile')) return say('Only Finance reconciles refunds');
  if (!/^[A-Z0-9-]{6,}$/i.test(gatewayRef)) return say('Enter the gateway or bank reference shown on the settlement report');
  if ([r.first, r.second].includes(meName())) return say('Refused: you approved this refund, so someone else must reconcile it');
  r.status = 'Reconciled'; r.recon = gatewayRef; r.log.push(`${nowT()} · reconciled by ${meName()} against ${gatewayRef}`);
  audit('Refunds', 'Refund reconciled', `${r.id} · ${rs(r.amount)} · ${gatewayRef} · ${meName()}`); saveRF(); renderRefunds(); say(`${r.id} reconciled`);
}
function renderRefunds() {
  const el = q('#refunds'); if (!el) return;
  const canA = pcan('refunds:approve'), canR = pcan('settlements:reconcile'), lim = myLimit();
  const badge = s => `<span class="badge${/Pending|Awaiting/.test(s) ? ' warn' : s === 'Rejected' ? ' red' : ''}">${esc(s)}</span>`;
  const open = RF.items.filter(r => !['Reconciled', 'Rejected'].includes(r.status)).length;
  el.innerHTML = `<div class="pagehead"><div><h1>Refunds & payments</h1><p>${canA ? `You approve refunds up to <b>${lim === Infinity ? 'any amount (a second approver is needed above ₹25,000)' : rs(lim)}</b>.` : canR ? 'You reconcile approved refunds against the settlement report. You cannot approve them.' : 'View only for your role.'} ${open} open.</p></div>
    <div class="actions"><button class="btn" data-export="refunds">Export CSV</button></div></div>
    <div class="card panel"><table class="table" id="rfTable"><thead><tr><th>Refund</th><th>Linked to</th><th>Reason</th><th>Amount</th><th>Requested by</th><th>Status</th><th>Action</th></tr></thead><tbody>
    ${RF.items.map(r => {
      const can1 = canA && (r.status === 'Pending' || (r.status === 'Awaiting second approver' && r.first !== meName()));
      const over = r.status === 'Pending' && canA && r.amount > lim;
      const act = can1 ? (over ? `<small>Above your limit · ${r.amount > OWNER_SECOND_ABOVE ? 'the owner decides, with a second approver' : 'the owner decides'}</small>` : `<button class="btn primary" data-rf-approve="${r.id}">${r.status === 'Pending' ? 'Approve' : 'Countersign'}</button> <button class="btn" data-rf-reject="${r.id}">Reject</button>`)
        : canR && r.status.startsWith('Approved') ? `<button class="btn primary" data-rf-recon="${r.id}">Reconcile</button>` : '';
      return `<tr data-rf="${r.id}"><td><b>${r.id}</b></td><td>${esc(r.ref)}</td><td>${esc(r.reason)}</td><td>${rs(r.amount)}</td><td>${esc(r.by)}</td><td>${badge(r.status)}${r.recon ? `<br><small>${esc(r.recon)}</small>` : ''}</td><td>${act}</td></tr>`;
    }).join('')}</tbody></table>
    <p style="font-size:13px">Rules: nobody approves a refund they requested; each approver has a limit; above ₹25,000 the owner needs a second approver; whoever approved a refund cannot reconcile it.</p></div>`;
}

