// ================================================================ events
document.addEventListener('click', e => {
  const t = e.target;
  const ap = t.closest('[data-rf-approve]');
  if (ap) { const r = RF.items.find(x => x.id === ap.dataset.rfApprove), second = r.status === 'Awaiting second approver';
    open(`${second ? 'Countersign' : 'Approve'} ${r.id}`, `<p style="font-size:20px;margin:0"><b>${rs(r.amount)}</b></p><p>${esc(r.reason)}<br><small>${esc(r.ref)} · requested by ${esc(r.by)}</small></p>
      <p>${second ? `First approved by ${esc(r.first)}. Countersigning releases the refund to Finance.` : 'The refund goes to Finance for reconciliation once approved.'}</p>`, footer('rfApproveGo', second ? 'Countersign refund' : `Approve ${rs(r.amount)}`));
    q('#rfApproveGo').onclick = () => { close(); decideRefund(r.id, true); }; return; }
  const rj = t.closest('[data-rf-reject]');
  if (rj) { open('Reject refund', '<div class="field"><label>Reason the customer will see</label><input id="rfWhy" placeholder="For example: item not returned to the store"></div>', footer('rfRejectGo', 'Reject refund'));
    q('#rfRejectGo').onclick = () => { const w = q('#rfWhy').value.trim(); if (!w) return say('Enter the reason'); close(); decideRefund(rj.dataset.rfReject, false, w); }; return; }
  const rc = t.closest('[data-rf-recon]');
  if (rc) { const r = RF.items.find(x => x.id === rc.dataset.rfRecon);
    open(`Reconcile ${r.id}`, `<p>${esc(r.reason)} · <b>${rs(r.amount)}</b></p><div class="field"><label>Gateway or bank reference from the settlement report</label><input id="rfRef" placeholder="For example: UTR-447109231846"></div>`, footer('rfReconGo', 'Reconcile'));
    q('#rfReconGo').onclick = () => { const v = q('#rfRef').value.trim(); close(); reconcileRefund(r.id, v); }; return; }
  const ex = t.closest('[data-export]');
  if (ex) {
    const k = ex.dataset.export;
    if (k === 'refunds') return download('AIFirstMart-refunds.csv', [['Refund', 'Linked to', 'Reason', 'Amount', 'Requested by', 'Status', 'Approved by', 'Second approver', 'Reconciled with'], ...RF.items.map(r => [r.id, r.ref, r.reason, r.amount, r.by, r.status, r.first || '', r.second || '', r.recon || ''])]);
    if (k === 'training') return download('AIFirstMart-training.csv', [['Course', 'Completed', 'Lessons'], ...myProgress().map(x => [x.title, x.done, x.total])]);
    if (k === 'approvals') { const tb = q('#overlay.show #modalBody table'); return tb ? download('AIFirstMart-approval-history.csv', tableRows(tb)) : say('No history table to export'); }
  }
  if (t.closest('[data-print]')) { audit('Reports', 'Printed', q('.screen.active h1')?.textContent || 'page'); return window.print(); }
  if (t.closest('.afm-textsize')) { A11.zoom = A11.zoom >= 1.3 ? 1 : Math.round((A11.zoom + 0.15) * 100) / 100; store(A11Y_KEY, A11); applyZoom(); q('.afm-textsize')?.remove(); textSizeButton(); return say(`Text size ${Math.round(A11.zoom * 100)}%`); }
  // shop
  const ch = t.closest('[data-shop-ch]'); if (ch) { SH.channel = ch.dataset.shopCh; saveSH(); return renderShop(); }
  if (t.closest('#shSignout')) { audit('Customer shop', 'Customer signed out', SH.who?.label || ''); SH.who = null; SH.otp = null; SH.wantSignin = false; saveSH(); return renderShop(); }
  if (t.closest('#shSendCode')) {
    const d = (q('#shPhone').value || '').replace(/\D/g, ''), phone = d.length === 10 ? '+91' + d : d.length === 12 && d.startsWith('91') ? '+' + d : null;
    if (!phone) return say('Enter a 10-digit mobile number');
    SH.otp = {phone, code: String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), tries: 0, until: Date.now() + 300000}; saveSH(); renderShop(); q('#shCode')?.focus(); return;
  }
  if (t.closest('#shVerify')) {
    const o = SH.otp, c = (q('#shCode').value || '').trim();
    if (!o || Date.now() > o.until) { SH.otp = null; saveSH(); renderShop(); return say('That code has expired. Send a new one'); }
    if (++o.tries > 5) { SH.otp = null; saveSH(); renderShop(); return say('Too many attempts. Send a new code'); }
    if (c !== o.code) { saveSH(); return say(`That code is not right. ${5 - o.tries} tries left`); }
    SH.otp = null; return signedIn(o.phone, o.phone.replace('+91', '+91 '), 'mobile code');
  }
  if (t.closest('#shGoogle')) return signedIn('priya.s@gmail.com', 'priya.s@gmail.com', 'Google');
  if (t.closest('#shEmailGo')) {
    const em = (q('#shEmail').value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return say('Enter a valid email address');
    if ((q('#shPass').value || '').length < 8) return say('Enter a password of at least 8 characters');
    return signedIn(em, em, 'email');
  }
  if (t.closest('#shWaStart')) {
    const d = (q('#shWaPhone').value || '').replace(/\D/g, ''); if (d.length !== 10) return say('Enter a 10-digit mobile number');
    signedIn('+91' + d, '+91 ' + d, 'WhatsApp number');
    if (!SH.chat.some(m => m.who === '+91' + d)) { waSay('shop', 'Vanakkam! 🙏 Welcome to AIFirstMart Retail. How would you like your groceries?<br>⚡ <b>Immediate delivery</b> within 45 minutes<br>📅 <b>Weekly plan</b>, the same basket every week<br>🗓 <b>Monthly plan</b> for your monthly staples'); saveSH(); renderShop(); }
    return;
  }
  const inc = t.closest('[data-shop-inc]'), dec = t.closest('[data-shop-dec]');
  if (inc || dec) { const el = inc || dec, sku = el.dataset[inc ? 'shopInc' : 'shopDec'], it = products().find(x => x.id === sku);
    const g = SH.channel === 'web' ? 'now' : PLAN[el.dataset.plan] ? el.dataset.plan : curPlan(), sub = g !== 'now' && SH.who && activeSub(g);
    // Adding to a group that already has a plan changes that plan rather than starting a second one.
    if (sub && SH.editing !== sub.id) { SH.editing = sub.id; basket(g); SH.baskets[cartKey()][g] = Object.fromEntries(sub.lines.map(l => [l.sku, l.qty])); }
    const c = basket(g), cap = g === 'now' ? avail(it) : PLAN_MAX;
    if (g !== curPlan()) SH.plan = g;
    c[sku] = Math.max(0, Math.min(cap, (c[sku] || 0) + (inc ? 1 : -1))); if (!c[sku]) delete c[sku];
    if (inc && SH.channel === 'whatsapp') say(`${it.n} × ${c[sku]} in your ${PLAN[g].label.toLowerCase()}`);
    saveSH(); return renderShop(); }
  const pl = t.closest('[data-shop-plan]'); if (pl) { SH.plan = pl.dataset.shopPlan; saveSH(); renderShop(); return q(`[data-shop-plan="${SH.plan}"]`)?.focus(); }
  if (t.closest('#shStartPlan')) return startPlan(curPlan());
  if (t.closest('#shPlanEditCancel')) { const x = SH.subs.find(s => s.id === SH.editing); if (x) SH.baskets[cartKey()][x.plan] = {}; SH.editing = null; saveSH(); return renderShop(); }
  const sr = t.closest('[data-sub-run]'); if (sr) return runSub(sr.dataset.subRun);
  const sk = t.closest('[data-sub-skip]');
  if (sk) { const x = SH.subs.find(s => s.id === sk.dataset.subSkip), was = x.next; x.next = nextDate(x.plan, x.when, x.next); x.skipped = (x.skipped || 0) + 1;
    audit('Customer shop', 'Plan delivery skipped', `${x.id} · ${dstr(was)}`); if (x.ch === 'whatsapp' && SH.who) waSay('shop', `⏭ ${x.id}: ${dstr(was)} skipped. Next delivery ${dstr(x.next)}.`);
    saveSH(); renderShop(); return say(`${dstr(was)} skipped. Next delivery ${dstr(x.next)}`); }
  const sp = t.closest('[data-sub-pause]');
  if (sp) { const x = SH.subs.find(s => s.id === sp.dataset.subPause); x.status = x.status === 'Active' ? 'Paused' : 'Active'; if (x.status === 'Active') x.next = nextDate(x.plan, x.when);
    audit('Customer shop', x.status === 'Paused' ? 'Plan paused' : 'Plan resumed', x.id); saveSH(); renderShop(); return say(x.status === 'Paused' ? `${x.id} paused. No deliveries until you resume` : `${x.id} resumed. Next delivery ${dstr(x.next)}`); }
  const se = t.closest('[data-sub-edit]');
  if (se) { const x = SH.subs.find(s => s.id === se.dataset.subEdit); SH.editing = x.id; SH.plan = x.plan; basket(x.plan); SH.baskets[cartKey()][x.plan] = Object.fromEntries(x.lines.map(l => [l.sku, l.qty])); saveSH(); renderShop(); return q('#shCart')?.scrollIntoView({block: 'nearest'}); }
  const sc2 = t.closest('[data-sub-cancel]');
  if (sc2) { const x = SH.subs.find(s => s.id === sc2.dataset.subCancel);
    open(`Cancel ${PLAN[x.plan].label.toLowerCase()} ${x.id}?`, `<p>No more deliveries will be sent. Orders already sent are not affected. You can start a new plan at any time.</p><p>If you only need a break, <b>Pause</b> keeps your basket and settings.</p>`,
      '<button class="btn" data-a="cancel">Keep my plan</button><button class="btn primary" id="shSubCancelGo">Cancel plan</button>');
    q('#shSubCancelGo').onclick = () => { x.status = 'Cancelled'; if (SH.editing === x.id) SH.editing = null; audit('Customer shop', 'Plan cancelled', x.id); saveSH(); close(); renderShop(); say(`${x.id} cancelled`); };
    return; }
  if (t.closest('#shCheckout')) { if (!SH.who) { SH.wantSignin = true; saveSH(); renderShop(); return q('#shSignin input, #shSignin button')?.focus(); } return placeOrder(); }
  if (t.closest('#shSigninBtn')) { SH.wantSignin = true; saveSH(); renderShop(); return q('#shSignin input, #shSignin button')?.focus(); }
  const nx = t.closest('[data-shop-next]');
  if (nx) { const o = SH.orders.find(x => x.id === nx.dataset.shopNext); o.step = Math.min(3, o.step + 1);
    window.AFMChannels?.seed(S => { const co = S.orders.find(x => x.id === o.id); if (co) co.status = STEPS[o.step]; if (o.step === 3) for (const l of o.lines) { S.reserved[l.sku] = Math.max(0, (S.reserved[l.sku] || 0) - l.qty); const it = products().find(x => x.id === l.sku); if (it) it.s = Math.max(0, it.s - l.qty); } });
    if (o.ch === 'whatsapp') waSay('shop', `📦 ${o.id}: ${STEPS[o.step]}`);
    audit('Customer shop', 'Order status', `${o.id} · ${STEPS[o.step]}`); saveSH(); return renderShop(); }
  const rt = t.closest('[data-shop-return]'); if (rt) return returnDialog(rt.dataset.shopReturn);
  const wa = t.closest('[data-shopwa]');
  if (wa) {
    const k = wa.dataset.shopwa;
    if (k.startsWith('g:') || k === 'catalogue') { const g = k === 'catalogue' ? 'now' : k.slice(2); SH.plan = g; waSay('me', `${PLAN[g].icon} ${PLAN[g].label}`); waSay('shop', waGroupMessage(g)); }
    if (k === 'plans') { const xs = mySubs(); waSay('me', 'My plans'); waSay('shop', xs.length ? xs.map(x => `${PLAN[x.plan].icon} <b>${x.id}</b> · ${x.status}${x.status === 'Active' ? ` · next ${dstr(x.next)}` : ''}`).join('<br>') + '<br>Use <b>My plans</b> beside the chat to skip, pause, change or cancel.' : 'You have no plans yet. Choose 📅 Weekly plan or 🗓 Monthly plan to start one.'); }
    if (k === 'cart') { const g = curPlan(), lines = basketLines(g), per = g === 'now' ? '' : g === 'weekly' ? ' a week' : ' a month'; waSay('me', 'Review my basket'); waSay('shop', lines.length ? `${PLAN[g].icon} ${PLAN[g].label}: ${lines.map(l => `${esc(l.it.n)} × ${l.qty}`).join(', ')}. Total <b>${rs(basketTotal(g))}</b>${per}. ${g === 'now' ? 'Choose delivery and payment beside the chat, then place the order.' : 'Choose the day, time and payment beside the chat, then start the plan.'}` : `Your ${PLAN[g].label.toLowerCase()} basket is empty. Choose ${PLAN[g].icon} ${PLAN[g].label} to add items.`); }
    if (k === 'orders') { const mine = SH.orders.filter(o => o.who === SH.who.key); waSay('me', 'Track my order'); waSay('shop', mine.length ? mine.slice(0, 3).map(o => `${o.id}: <b>${STEPS[o.step]}</b>`).join('<br>') : 'You have no orders yet.'); }
    saveSH(); return renderShop();
  }
  const ol = t.closest('[data-open-lesson]'); if (ol) { const [k, i] = ol.dataset.openLesson.split(':'); return openLesson(k, Number(i)); }
  if (t.closest('#bpPreview')) return bulkPreview();
  if (t.closest('#bpCancel')) { preview = null; q('#bpPreviewOut').innerHTML = ''; return; }
  if (t.closest('#bpApply')) return bulkApply();
  const sc = t.closest('[data-sched-cancel]');
  if (sc) { const s = PR.scheduled.splice(Number(sc.dataset.schedCancel), 1)[0]; audit('Pricing', 'Scheduled price cancelled', `${s.n} · ${s.from}`); PR.open = true; savePR(); q('#priceTools')?.remove(); return pricingPanel(); }
}, false);
document.addEventListener('input', e => { if (e.target.id === 'lessonSearch') { search = e.target.value; renderRecords(); } if (e.target.id === 'catSearch') { catFilter = e.target.value; catalogueHelp(); } });
document.addEventListener('change', e => { if (e.target.id === 'oneRolePick') { A11.oneRole = e.target.value; store(A11Y_KEY, A11); matrixRoleView(); } });
document.addEventListener('toggle', e => { if (e.target.id === 'priceTools') { PR.open = e.target.open; savePR(); } }, true);

