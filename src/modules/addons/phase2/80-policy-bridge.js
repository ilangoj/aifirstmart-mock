// ================================================================ one policy everywhere
const RIGHT_TO_PERM = {'sale.manage': 'sales:write', 'catalog.manage': 'catalog:write', 'inventory.manage': 'inventory:write', 'approval.decide': 'approvals:decide',
  'oms.manage': 'orders:write', 'logistics.manage': 'delivery:write', 'admin.manage': 'settings:manage', 'signal.configure': 'settings:manage'};
try {
  const baseCan = can;
  can = function (right) {
    const ok = baseCan.apply(this, arguments);
    const perm = RIGHT_TO_PERM[right], P = POL();
    if (!ok || !perm || !P || ['payments', 'customer'].includes(persona())) return ok;
    return P.can(perm);                               // both the screen's role and the published policy must allow it
  };
} catch (e) {}
let policyVer = -1;
function policyWatch() {
  const v = POL()?.state().published.version;
  if (v !== policyVer) { policyVer = v; try { markPersonaActions(); } catch (e) {} }
}

