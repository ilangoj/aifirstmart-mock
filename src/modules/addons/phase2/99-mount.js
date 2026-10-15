// ================================================================ keep everything mounted
let lastWho = '';
function ensure() {
  if (!q('#side [data-nav="refunds"]') || !q('#refunds')) mountScreens();
  const who = persona();
  if (who !== lastWho) { lastWho = who; renderRefunds(); renderShop(); renderRecords(); }
  pricingPanel(); catalogueHelp(); exportsAndPrint(); textSizeButton(); betterToasts(); launchLabel(); matrixRoleView(); policyWatch(); trackPrices(); pushProgress();
  if (narrow() !== wasNarrow) { wasNarrow = narrow(); if (wasNarrow && A11.oneRole == null) { A11.oneRole = '0'; matrixRoleView(); } }
}
const narrow = () => window.innerWidth < 760; let wasNarrow = null;
a11yStyles(); applyZoom(); mountScreens(); renderRefunds(); renderShop(); renderRecords(); runSchedule();
if (!Object.keys(PR.snap).length) trackPrices();
setInterval(ensure, 400); setInterval(runSchedule, 30000);
connectRecords();
window.AFMPhase2 = {refunds: () => RF, shop: () => SH, pricing: () => PR, a11y: () => A11, reset: () => { RF = rf0(); SH = shop0(); PR = {scheduled: [], history: [], snap: {}}; saveRF(); saveSH(); savePR(); trackPrices(); renderRefunds(); renderShop(); }, renderRefunds, renderShop, renderRecords,
  resetRefunds: () => { RF = rf0(); saveRF(); renderRefunds(); }, resetShop: () => { SH = shop0(); saveSH(); renderShop(); }};
})();
