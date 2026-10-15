/* AIFirstMart mock: Back office and customers course (added to the guided training after it loads). */
(() => {
'use strict';
const T = window.AFMGuidedTraining; if (!T || !T.courses || T.courses.backoffice) return;
const q = s => document.querySelector(s);
const who = () => { try { return session.activePersona; } catch (e) { return ''; } };
const scr = () => q('.screen.active')?.id;
const modal = () => q('#overlay.show') ? (q('#overlay.show #modalTitle')?.textContent || 'a window') : null;
const val = sel => (q('#overlay.show ' + sel)?.value || '').trim();
const RF = id => window.AFMPhase2?.refunds().items.find(r => r.id === id);
const SH = () => window.AFMPhase2?.shop();
const role = (p, screen, label, screenLabel) => ({id: 'role', kind: 'action',
  text: `Choose <b>View as: ${label}</b> at the top right, then open <b>${screenLabel}</b> in the left menu.`,
  target: () => modal() ? (q('#modalFoot [data-a="cancel"]') || q('#overlay .modalclose')) : who() !== p ? q('#personaSelect') : q(`#side [data-nav="${screen}"]`),
  check: () => modal() ? `Close the open window (${modal()}) first.` : who() !== p ? `Choose ${label} in View as.` : scr() !== screen ? `Open ${screenLabel} in the left menu.` : true});
const ask = (id, text, options, correct, why) => ({id, kind: 'ask', text, options, correct, why});
const status = id => RF(id)?.status || '';
const wk = () => { const s = SH(); if (!s) return {}; const b = s.baskets?.[s.who ? s.who.key : 'guest'] || {}; return b.weekly || {}; };
const sub = () => SH()?.subs?.find(x => x.plan === 'weekly' && x.status !== 'Cancelled');
const val2 = sel => (q(sel)?.value || '').trim();

T.courses.backoffice = {title: 'Back office and customers: Kumar, Anitha and Priya', lessons: [
 {title: 'Approve refunds within your limit', screen: 'refunds', decisions: [],
  situation: 'You are Kumar, the payment approver. Four customer refunds are waiting, from ₹238 to ₹32,000. Your limit is ₹10,000 per refund.',
  why: 'A refund sends the business’s money out. Limits make sure larger amounts get a more senior decision, and a second person checks anything very large.',
  handoff: 'Approved refunds go to Finance, who reconcile each one against the payment gateway or bank report.',
  risk: 'Approving above your limit, or approving a refund you requested yourself, removes the check that stops mistakes and fraud.',
  note: 'In this practice the refund list is saved in your browser. The ₹32,000 refund needs the business owner, then a second approver.',
  setup: () => { try { AFMPhase2.resetRefunds(); } catch (e) {} },
  steps: [
   role('payments', 'refunds', 'Payment approver', 'Refunds & payments'),
   {id: 'read', kind: 'read', target: () => q('#rfTable'),
    text: 'Read the queue: four refunds, and the line at the top saying you approve up to <b>₹10,000</b>. RF-504 for <b>₹32,000</b> shows <b>Above your limit</b> instead of buttons.'},
   {id: 'small', kind: 'action', text: 'On <b>RF-501</b> (₹238, gateway charged twice), choose <b>Approve</b>. Check the amount in the window, then confirm.',
    target: () => modal() ? q('#overlay.show #rfApproveGo') : q('[data-rf-approve="RF-501"]'), check: () => status('RF-501').startsWith('Approved') || 'RF-501 is not approved yet.'},
   ask('big', 'Why can’t you approve RF-504 for ₹32,000?', ['It is above my ₹10,000 limit, so the owner decides', 'Refunds over ₹30,000 are never paid', 'Customer support must approve it'], 0,
     'Your limit is ₹10,000. The owner decides larger refunds, and above ₹25,000 a second person must countersign.'),
   {id: 'mid', kind: 'action', text: 'On <b>RF-503</b> (₹8,400, bulk order cancelled), choose <b>Approve</b>. It is within your limit. Confirm in the window.',
    target: () => modal() ? q('#overlay.show #rfApproveGo') : q('[data-rf-approve="RF-503"]'), check: () => status('RF-503').startsWith('Approved') || 'RF-503 is not approved yet.'},
   ask('next', 'Who checks that the approved money really left the business?', ['Finance, who reconcile it against the settlement report', 'You, the approver', 'Nobody; approval is enough'], 0,
     'Approving and reconciling are kept apart, so a second person confirms what actually happened.'),
  ]},
 {title: 'Reconcile approved refunds', screen: 'refunds', decisions: [],
  situation: 'You are Anitha in Finance. RF-501 for ₹238 was approved by Kumar. The gateway’s settlement report shows the refund under reference UTR-447109231846.',
  why: 'Reconciling proves that the money approved is the money that actually moved. It catches refunds paid twice, paid to the wrong customer, or never paid.',
  handoff: 'Reconciled refunds close in the books; any difference goes back to the approver with a named owner.',
  risk: 'Marking a refund reconciled without matching the reference hides exactly the errors reconciliation is meant to find.',
  note: 'Finance reconciles but cannot approve. Whoever approved a refund cannot reconcile it.',
  setup: () => { try { const r = RF('RF-501'); if (!r || !r.status.startsWith('Approved') && r.status !== 'Reconciled') { AFMPhase2.resetRefunds(); const x = RF('RF-501'); x.status = 'Approved · awaiting reconciliation'; x.first = 'Kumar'; localStorage.setItem('afm-refunds-v1', JSON.stringify(AFMPhase2.refunds())); } else if (r.status === 'Reconciled') { r.status = 'Approved · awaiting reconciliation'; delete r.recon; localStorage.setItem('afm-refunds-v1', JSON.stringify(AFMPhase2.refunds())); } AFMPhase2.renderRefunds(); } catch (e) {} },
  steps: [
   role('finance', 'refunds', 'Finance & accounts', 'Refunds & payments'),
   ask('approve', 'There are no Approve buttons for you on this screen. Why?', ['Finance reconciles refunds but does not approve them', 'The screen is broken', 'Only the morning shift approves'], 0,
     'Separating approval from reconciliation means two different people are involved in every refund.'),
   {id: 'recon', kind: 'action', text: 'On <b>RF-501</b>, choose <b>Reconcile</b>. Type the reference <b>UTR-447109231846</b> and choose <b>Reconcile</b>.',
    target: () => modal() ? (val('#rfRef') !== 'UTR-447109231846' ? q('#overlay.show #rfRef') : q('#overlay.show #rfReconGo')) : q('[data-rf-recon="RF-501"]'),
    guard: {sel: '#rfReconGo', check: () => val('#rfRef') !== 'UTR-447109231846' ? 'Type the reference exactly as the report shows it: UTR-447109231846.' : null},
    check: () => status('RF-501') === 'Reconciled' || 'RF-501 is not reconciled yet.'},
   ask('diff', 'The report showed ₹283 instead of ₹238. What should you do?', ['Not reconcile it, and send the difference back to the approver with a named owner', 'Reconcile it; the difference is small', 'Change the refund to ₹283'], 0,
     'A difference is exactly what reconciliation exists to find. It needs an owner and an explanation, not a quiet fix.'),
  ]},
 {title: 'A customer orders and returns, end to end', screen: 'shop', decisions: [],
  situation: 'Priya orders milk on WhatsApp. After delivery, one packet is leaking and she asks for a refund. You follow her order from her phone to the store’s refund queue.',
  why: 'Seeing the customer’s side shows why stock reservations, delivery rules and refund limits matter: each one is a promise to a real person.',
  handoff: 'Her order appears in Channel orders for the store; her return becomes a refund for the payment approver.',
  risk: 'If the store’s rules are hidden from the customer, such as Express needing online payment, orders fail at the last step and customers give up.',
  note: 'This practice simulates WhatsApp and the delivery steps. In the real platform the steps come from the store’s picking and delivery work.',
  setup: () => { try { AFMPhase2.resetShop(); const s = AFMPhase2.shop(); s.channel = 'whatsapp'; localStorage.setItem('afm-shop-v1', JSON.stringify(s)); AFMPhase2.renderShop(); } catch (e) {} },
  steps: [
   role('customer', 'shop', 'Customer (shop view)', 'Customer shop'),
   {id: 'chat', kind: 'action', text: 'Make sure <b>WhatsApp</b> is selected. Keep the number <b>98765 43210</b> and choose <b>Start chat</b>.',
    target: () => SH()?.channel !== 'whatsapp' ? q('[data-shop-ch="whatsapp"]') : q('#shWaStart'), check: () => !!SH()?.who || 'Start the WhatsApp chat.'},
   {id: 'add', kind: 'action', text: 'Choose <b>⚡ Immediate delivery</b>, then <b>＋ Add</b> on <b>Aavin Milk 500ml</b> twice.',
    target: () => q('#shChat [data-shop-inc="8901002"][data-plan="now"]') || q('[data-shopwa="g:now"]'),
    check: () => ((SH()?.carts[SH().who?.key] || {})['8901002'] || 0) >= 2 || 'Add two Aavin Milk 500ml to the cart.'},
   {id: 'order', kind: 'action', text: 'Beside the chat, in <b>⚡ Immediate delivery</b>, keep <b>Delivery: Express</b>, set <b>Payment: UPI</b>, then choose <b>Place order</b>.',
    target: () => !q('#shSlot') ? q('#shCart') : q('#shSlot').value !== 'express' ? q('#shSlot') : q('#shPay').value !== 'upi' ? q('#shPay') : q('#shCheckout'),
    check: () => SH()?.orders.some(o => o.ch === 'whatsapp' && o.lines.some(l => l.sku === '8901002')) || 'The order is not placed yet.'},
   ask('express', 'Why would Express with cash on delivery have been refused?', ['Express deliveries must be paid online', 'Express is closed on WhatsApp', 'Milk cannot go by Express'], 0,
     'The store’s rule is that Express must be prepaid; the shop explains it instead of failing silently.'),
   {id: 'deliver', kind: 'action', text: 'In <b>My orders</b>, choose <b>Simulate next step</b> until the order shows <b>Delivered</b>.',
    target: () => q('[data-shop-next]'), check: () => SH()?.orders.some(o => o.step === 3) || 'The order is not delivered yet.'},
   {id: 'return', kind: 'action', text: 'Choose <b>Return an item</b>. Keep <b>Aavin Milk 500ml</b>, quantity <b>1</b>, reason <b>Damaged or leaking</b>, and choose <b>Request return</b>.',
    target: () => modal() ? q('#overlay.show #shRetSave') : q('[data-shop-return]'),
    guard: {sel: '#shRetSave', check: () => val('#shRetQty') !== '1' ? 'Return just the one leaking packet: quantity 1.' : q('#overlay.show #shRetWhy').value !== 'Damaged or leaking' ? 'Choose the reason Damaged or leaking.' : null},
    check: () => SH()?.orders.some(o => o.ret) || 'The return is not requested yet.'},
   {id: 'approve', kind: 'action', text: 'Now switch <b>View as</b> to <b>Payment approver</b>, open <b>Refunds & payments</b>, and approve Priya’s refund at the top of the list (₹26), confirming in the window.',
    target: () => who() !== 'payments' ? q('#personaSelect') : scr() !== 'refunds' ? q('#side [data-nav="refunds"]') : (modal() ? q('#overlay.show #rfApproveGo') : q('#rfTable [data-rf-approve]')),
    check: () => (window.AFMPhase2?.refunds().items.find(r => /Customer return/.test(r.reason))?.status || '').startsWith('Approved') || 'Priya’s refund is not approved yet.'},
  ]},
 {title: 'A customer starts and manages a weekly plan', screen: 'shop', decisions: [],
  situation: 'Priya wants two packets of milk and a kilo of onions every Saturday morning, without ordering each week. She uses the mobile app.',
  why: 'Plans bring steady, predictable orders. The store can plan stock and delivery runs, and the customer saves time, as long as skipping, pausing and changes are easy.',
  handoff: 'On each delivery day the plan becomes an ordinary order in Channel orders, with stock reserved, for the store to pick and deliver.',
  risk: 'If a plan is hard to skip or pause, customers cancel it, or refuse deliveries at the door, and the store wastes stock and delivery runs.',
  note: 'This practice simulates the delivery day with a button. In the real platform, each plan delivery is created automatically after the 8 PM cut-off the day before.',
  setup: () => { try { AFMPhase2.resetShop(); const s = AFMPhase2.shop(); s.channel = 'mobile_app'; s.plan = 'now'; localStorage.setItem('afm-shop-v1', JSON.stringify(s)); AFMPhase2.renderShop(); } catch (e) {} },
  steps: [
   role('customer', 'shop', 'Customer (shop view)', 'Customer shop'),
   {id: 'tab', kind: 'action', text: 'Choose the <b>Mobile app</b> tab. In the app, choose <b>📅 Weekly plan</b>.',
    target: () => SH()?.channel !== 'mobile_app' ? q('[data-shop-ch="mobile_app"]') : q('[data-shop-plan="weekly"]'),
    check: () => (SH()?.channel === 'mobile_app' && SH()?.plan === 'weekly') || 'Open the Mobile app tab and choose Weekly plan.'},
   {id: 'add', kind: 'action', text: 'Under <b>Suggested for weekly plan</b>, add <b>Aavin Milk 500ml</b> twice and <b>Red Onion 1kg</b> once.',
    target: () => { const b = wk(); return (b['8901002'] || 0) < 2 ? q('[data-shop-item="8901002"] [data-shop-inc]') : q('[data-shop-item="8901007"] [data-shop-inc]'); },
    check: () => ((wk()['8901002'] || 0) >= 2 && (wk()['8901007'] || 0) >= 1) || 'Add 2 Aavin Milk 500ml and 1 Red Onion 1kg to the weekly plan.'},
   {id: 'signin', kind: 'action', text: 'Choose <b>Sign in to start</b>. Sign in with email <b>priya@example.com</b> and password <b>priya-pass-1</b>.',
    target: () => !q('#shSignin') ? q('#shStartPlan') : !val2('#shEmail') ? q('#shEmail') : !val2('#shPass') ? q('#shPass') : q('#shEmailGo'),
    check: () => !!SH()?.who || 'Sign in as Priya.'},
   {id: 'start', kind: 'action', text: 'Set <b>Delivery day: Every Saturday</b>, <b>Time slot: Morning 7–9 AM</b> and <b>Payment: UPI Autopay</b>. Then choose <b>Start weekly plan</b>.',
    target: () => !q('#shPlanWhen') ? q('#shCart') : q('#shPlanWhen').value !== '6' ? q('#shPlanWhen') : q('#shPlanPay').value !== 'upi' ? q('#shPlanPay') : q('#shStartPlan'),
    guard: {sel: '#shStartPlan', check: () => q('#shPlanWhen')?.value !== '6' ? 'Priya wants Saturdays: choose Every Saturday.' : q('#shPlanSlot')?.value !== 'Morning 7–9 AM' ? 'Choose the morning slot, 7–9 AM.' : null},
    check: () => !!sub() || 'The weekly plan is not started yet.'},
   ask('away', 'Priya is away next Saturday but wants her plan to carry on after that. What should she do?', ['Skip next delivery', 'Cancel the plan and start a new one later', 'Let it be delivered; someone will take it in'], 0,
     'Skipping moves the plan on by one week and keeps everything else. Cancelling loses her settings, and an unwanted delivery wastes stock and a delivery run.'),
   {id: 'skip', kind: 'action', text: 'In <b>My plans</b>, choose <b>Skip next delivery</b>. The next delivery moves on by a week.',
    target: () => q('[data-sub-skip]'), check: () => (sub()?.skipped || 0) >= 1 || 'Skip the next delivery.'},
   {id: 'run', kind: 'action', text: 'Now choose <b>Delivery day (practice)</b>. The plan becomes an order for the store, and appears in <b>My orders</b>.',
    target: () => q('[data-sub-run]'), check: () => SH()?.orders.some(o => /Weekly plan/.test(o.service || '')) || 'Simulate the delivery day.'},
   ask('store', 'Where does the store see this delivery?', ['In Channel orders, as a normal order with stock reserved', 'Only in Priya’s app', 'In a separate subscriptions spreadsheet'], 0,
     'Each plan delivery becomes an ordinary order, so the store picks, packs and delivers it the same way as any other, and stock is reserved for it.'),
  ]},
]};
})();
