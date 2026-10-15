
/* AIFirstMart guided hands-on training (Cashier + Business owner, English).
 * Load after the platform's own scripts. It reads the platform's live state
 * (cart, disc, sale, payType, functionalState, session) and only moves to the
 * next step when the platform shows the correct result. */
(() => {
'use strict';
if (window.__afmGuided) return; window.__afmGuided = true;

const KEY = 'afm-guided-training-v1';
const UPI_REF = '447109231846';
const SEED_ID = 'APR-TRAIN-186';
const q = s => document.querySelector(s);
const vis = el => !!(el && el.offsetParent !== null);
const rs = n => '₹' + Number(n).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const r2 = n => Math.round(n * 100) / 100;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---- safe readers for platform state -------------------------------------
const P = {
  persona: () => { try { return session.activePersona; } catch (e) { return null; } },
  screen: () => q('.screen.active')?.id || null,
  cart: () => { try { return cart; } catch (e) { return []; } },
  disc: () => { try { return disc; } catch (e) { return 0; } },
  sale: () => { try { return sale; } catch (e) { return null; } },
  payType: () => { try { return payType; } catch (e) { return null; } },
  approvals: () => { try { return functionalState.approvals; } catch (e) { return []; } },
  audit: () => { try { return functionalState.audit; } catch (e) { return []; } },
  modal: () => q('#overlay')?.classList.contains('show') ? (q('#modalTitle')?.dataset.en || q('#modalTitle')?.textContent || '') : null,
  subtotal: () => r2(P.cart().reduce((a, x) => a + x.p * x.q, 0)),
  total: () => r2((P.subtotal() - P.disc()) * 1.05),
  milk: () => P.cart().find(x => x.id === '8901002'),
  onion: () => P.cart().find(x => x.id === '8901007'),
  weighed: () => P.cart().filter(x => x.weighted || String(x.id).startsWith('PLU-')),
};
const LABEL = {owner: 'Business owner', cashier: 'Cashier', manager: 'Store manager', admin: 'Retail administrator', catalogue: 'Catalogue manager'};
const plabel = k => { try { return personaLabel(k); } catch (e) { return LABEL[k] || k; } };
const SCREEN = {policy: 'Access policy', catalogue: 'Catalogue', channels: 'Channels', signin: 'Customer sign-in', observability: 'Observability', catalogue: 'Catalogue', sell: 'Sell', command: 'Command center', signals: 'Signals', approvals: 'Approvals', delivery: 'Logistics', audit: 'Audit', orders: 'Orders', stock: 'Stock', setup: 'Setup'};

// ---- training memory (separate from platform data) -----------------------
let mem = {course: null, lesson: 0, step: 0, view: 'home', done: {cashier: [], manager: [], owner: [], admin: []}, answers: {}, receipt: null, paid: null};
try { Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
for (const c of ['cashier', 'manager', 'owner', 'admin']) mem.done[c] = mem.done[c] || [];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };

// ---- evidence helpers: platform confirmations and new audit entries -------
const toasts = [];
let stepT0 = Date.now(), stepKey = '';
(function watchToast() {
  const t = q('#toast'); if (!t) return setTimeout(watchToast, 500);
  new MutationObserver(() => { const x = (t.textContent || '').trim(); if (x) toasts.push({t: x, at: Date.now()}); }).observe(t, {childList: true, characterData: true, subtree: true});
})();
const toastSince = re => toasts.some(x => x.at >= stepT0 && re.test(x.t));
const auditKey = a => a ? [a.time, a.area, a.action, a.detail].join('|') : '';
const markAudit = () => { mem.auditMark = auditKey(P.audit()[0]); save(); };
const newAudit = re => { const a = P.audit(); let i = mem.auditMark ? a.findIndex(x => auditKey(x) === mem.auditMark) : a.length; if (i < 0) i = a.length; return a.slice(0, i).some(x => re.test([x.area, x.action, x.detail].join(' / '))); };
const field = (sel) => q('#overlay.show ' + sel);
const OPT_EN_EXTRA = {'Edit product · Aavin Milk 500ml': [['Grocery', 'Dairy', 'Fresh produce', 'Personal care', 'Household']], 'Connect WhatsApp': [['Sandbox', 'Live'], ['Ulundurpet Main Store', 'All stores']], 'Suspend Flipkart': [['Stock errors', 'Security concern', 'Compliance lapse', 'Other']]};
const OPT_EN = {"Apply discount": [["Loyalty offer", "Damaged packaging", "Price match"]], "Select return items": [["Original payment method", "Store credit"]], "Return sale": [["Damaged product", "Wrong item", "Quality issue"]], "Assign order": [["Arun", "Meena", "Kavya"], ["Kavya", "Meena", "Same as picker"], ["Picker Mobile · PM-03", "Mobile · PM-02"]], "Start cycle count": [["Low-stock products", "Selected category", "Full store count"], ["Meena · Stock associate", "Arun · Supervisor"]], "Independent authenticated approval": [["Raj · Store manager · MGR-014", "Kavya · Cashier · requester"], ["Google MFA · security key verified", "Google Authenticator verified"], ["Approve 12% discount", "Reject"]], "Count and close shift": [["No variance", "Cash shortage", "Cash excess", "Opening float error"]], "Substitution": [["Heritage Milk 500ml · +₹2", "Arokya Milk 500ml · same price", "Remove item and refund"], ["Approved in WhatsApp", "Approved in mobile app", "Declined", "No response · refund item"], ["Charge difference", "Waive increase", "Refund difference"]], "Resolve failed delivery": [["Customer unavailable", "Wrong address", "Customer refused", "Unsafe delivery location"], ["Schedule reattempt", "Return to origin", "Cancel and refund"], ["Hold in return staging", "Restock after inspection", "Quarantine damaged goods"], ["WhatsApp + app notification", "Phone call required"]], "Create assisted order": [["Essentials basket · 6 items · ₹846", "Weekly basket · 12 items · ₹1,624"], ["Customer Pickup", "Planned Delivery", "Express Delivery"], ["Credit card paid", "Debit card paid", "Bank account paid", "Voucher paid", "Gift card paid", "Pay at pickup", "COD"]], "Receive stock": [["Ulundurpet Wholesale Traders", "Aavin Distributor", "Local Produce Partner"], ["Aashirvaad Atta 5kg", "Aavin Milk 500ml", "Ponni Rice 5kg", "Tata Salt 1kg", "Sunflower Oil 1L", "Marie Gold 250g", "Red Onion 1kg", "Toor Dal 1kg"]], "Inventory operations": [["Aashirvaad Atta 5kg · 18", "Aavin Milk 500ml · 32", "Ponni Rice 5kg · 11", "Tata Salt 1kg · 44", "Sunflower Oil 1L · 9", "Marie Gold 250g · 26", "Red Onion 1kg · 21", "Toor Dal 1kg · 14"], ["Damage / write-off", "Count variance", "Found stock"]], "Store and terminal": [["80 mm", "58 mm"], ["English", "Tamil", "Kannada"]], "Users and roles": [["Cashier", "Store Supervisor", "Catalogue Manager", "Inventory Manager", "Picker/Packer", "Logistics Supervisor", "Delivery Rider", "Retailer Administrator"], ["Ulundurpet Main Store", "RapidGo Partner", "All stores"]], "Cash drawer setup": [["After every cash payment", "Manager command only"]], "Add catalogue product": [["Grocery", "Dairy", "Personal care", "Household"]]};
Object.assign(OPT_EN, OPT_EN_EXTRA);
const englishVal = el => { if (!el) return ''; if (el.tagName !== 'SELECT') return (el.value || '').trim();
  const key = Object.keys(OPT_EN).find(k => isM(k)); const sels = [...document.querySelectorAll('#overlay.show #modalBody select')];
  const opts = key && OPT_EN[key] && OPT_EN[key][sels.indexOf(el)]; return (opts && opts[el.selectedIndex]) || (el.value || '').trim(); };
const fval = (sel) => englishVal(field(sel));
const swappedScreens = () => { const out = []; if (q('#signals [data-pim]')) out.push('Signals'); if (q('#approvals [data-pim]') || /^PIM-/.test(q('#approvals tbody tr td')?.textContent || '')) out.push('Approvals'); if (q('#setup [data-pim]') || (q('#setup .pagehead') && !q('#setup [data-a="drawer"]'))) out.push('Setup'); return out; };
const uiLang = () => { try { return lang; } catch (e) { return 'en'; } };
let lastOpen = null; const commits = {};
const openedBy = sel => !!(P.modal() !== null && lastOpen && lastOpen.isConnected !== undefined && lastOpen.matches && lastOpen.matches(sel));
const MODALS = {
  'Take payment': () => q('#overlay.show #payReference'), 'Add variable-weight item': () => q('#overlay.show #posWeight'), 'Apply discount': () => q('#overlay.show #di'),
  'Product not found': () => q('#overlay.show #modalFoot [data-a="submit"]') && q('#overlay.show #modalBody input'), 'Return sale': () => q('#overlay.show #returnReceipt'),
  'Select return items': () => q('#overlay.show #completeReturn'), 'Held sales': () => openedBy('[data-a="resume"]') || q('#overlay.show [data-resume]'),
  'Team capacity': () => openedBy('[data-ord="capacity"]'), 'Start cycle count': () => q('#overlay.show #submitCount'),
  'Independent authenticated approval': () => q('#overlay.show #strongApprover'), 'Count and close shift': () => q('#overlay.show #countedCash'),
  'Store and terminal': () => q('#overlay.show #saveStore'), 'Users and roles': () => q('#overlay.show #userName'), 'Payment configuration': () => q('#overlay.show #savePayments'),
  'Cash drawer setup': () => q('#overlay.show #saveDrawer'), 'Test scanner': () => q('#overlay.show #test'), 'Hardware assurance & certification': () => openedBy('[data-hardware-test]'),
  'Signal rules': () => q('#overlay.show #saveRules'), 'Create assisted order': () => q('#overlay.show #createAssistedOrder'), 'Receive stock': () => q('#overlay.show #postReceipt'),
  'Inventory operations': () => q('#overlay.show #invProduct'), 'Add catalogue product': () => q('#overlay.show #pcBar'), 'Approval history': () => openedBy('[data-a="history"]'),
  'Multi-store inventory proof': () => openedBy('[data-store-ledger]'), 'Resolve failed delivery': () => q('#overlay.show #commitFailed'), 'Substitution': () => q('#overlay.show #commitSub'),
  'Assign order': () => q('#overlay.show #confirmAssignment'), 'Rider statement': () => openedBy('[data-module="riderStatement"]'), 'Trace COR-STK-4102': () => openedBy('[data-trace="COR-STK-4102"]'),
  'Receipt': () => q('#overlay.show #modalFoot [data-a="next"]'),
  'Edit product · Aavin Milk 500ml': () => q('#overlay.show #catEditSave'), 'Import catalogue': () => q('#overlay.show #catSample'),
  'Publish access policy': () => q('#overlay.show #policyConfirm'), 'Submit access policy': () => q('#overlay.show #policyConfirm'), 'Add user': () => q('#overlay.show #puSave'),
  'Connect WhatsApp': () => q('#overlay.show #chConnectSave'), 'Suspend Flipkart': () => q('#overlay.show #chSuspendSave'),
};
const isM = name => P.modal() !== null && !!(MODALS[name] ? MODALS[name]() : P.modal() === name);
const committed = sel => commits[sel] && commits[sel] >= stepT0 && toasts.some(x => x.at >= commits[sel]);
const mtext = el => englishVal(el);
const modalInputs = () => [...document.querySelectorAll('#overlay.show #modalBody input:not([type=checkbox]), #overlay.show #modalBody select')];
const CAT = () => (window.AFMCatalogue ? window.AFMCatalogue.state() : {edits: {}, added: [], stage: null});
const stageRow = n => (CAT().stage?.rows || []).find(r => r.row === n);
const POL = () => (window.AFMPolicy ? window.AFMPolicy.state() : {published: {version: 0, extras: {}, limits: {}}, draft: {extras: {}, limits: {}}, users: [], tab: 'roles', lastRefusal: ''});
const divya = () => POL().users.find(u => u.id === 'U8');
const CHS = () => (window.AFMChannels ? window.AFMChannels.state() : {conn: {}, orders: [], reserved: {}, signin: {}});
const item = id => { try { return items.find(x => x.id === id); } catch (e) { return null; } };
const clicked = st => !!mem.answers[`${mem.course}-${mem.lesson}-${st}-clicked`];
const emptyStep = () => ({id: 'empty', kind: 'action', text: 'Start with an empty basket. If the basket already has items, choose <b>＋ New sale</b>.',
  target: () => P.cart().length ? q('[data-a="new"]') : null, check: () => P.cart().length === 0 || 'The basket is not empty. Choose ＋ New sale.'});
const seen = (key, title, waitMsg, openMsg) => () => { if (isM(title)) { mem.answers[key] = 1; return waitMsg; } return mem.answers[key] ? true : openMsg; };


// ---- step builders --------------------------------------------------------
const ready = (persona, screen, extra) => ({
  id: 'ready', kind: 'action', persona, screen,
  text: `Choose <b>View as: ${LABEL[persona]}</b> at the top right, then open <b>${SCREEN[screen]}</b> in the left menu.`,
  target: () => P.modal() ? (q('#modalFoot [data-a="cancel"]') || q('#overlay .modalclose, #overlay [aria-label="Close"]') || q('#modalFoot button')) : P.persona() !== persona ? q('#personaSelect') : q(`#side [data-nav="${screen}"]`),
  check: () => {
    if (P.modal()) return `Close the open window (${P.modal()}) first.`;
    if (P.persona() !== persona) return `The system is showing ${plabel(P.persona())}. Choose ${LABEL[persona]} in View as.`;
    if (P.screen() !== screen) return `Open ${SCREEN[screen]} in the left menu.`;
    return extra ? extra() : true;
  }
});
const ask = (id, text, options, correct, why) => ({id, kind: 'ask', text, options, correct, why});

const basketProblem = () => {
  const m = P.milk(), o = P.onion();
  if (!P.cart().length) return 'The basket is empty. It is cleared when the page reloads or a sale is completed. Go back to lesson 2 and build it again.';
  if (P.weighed().length) return 'A weighed onion line is in the basket. Choose Remove on it; in this training use the Red Onion 1kg pack.';
  if (!m) return 'The milk line is missing. Scan 8901002 twice.';
  if (m.q !== 2) return `The basket shows ${m.q} milk packets; the customer has 2. Use − or ＋ on the milk line.`;
  if (!o) return 'The onion line is missing. Scan 8901007 once.';
  if (o.q !== 1) return `The basket shows ${o.q} onion packs; the customer has 1. Use − on the onion line.`;
  if (P.cart().length !== 2) return `The basket has ${P.cart().length} lines; it should have exactly 2. Choose Remove on any extra line.`;
  return null;
};
const basketIntact = () => basketProblem() || true;

const DECISIONS = {
  D1: 'Who checks and signs off the ₹2,500 opening cash, and where it is recorded. The left menu shows Shift #A-042 with Cash ₹4,250.',
  D2: 'The correct GST rate for each product. This screen charges 5% on everything; fresh milk and fresh vegetables are generally nil-rated.',
  D3: 'The cash rounding rule for totals with paise, such as ₹93.45.',
  D4: 'The period the owner figures cover (today, month to date, or another period).',
  D5: 'Which costs are deducted to calculate contribution, and the contribution margin plan.',
  D6: 'When a signal is material enough to need the owner’s decision.',
  D7: 'Who decides cashier discounts above 10% (store manager or owner), and the upper limit for each.',
  D8: 'Whether “Expected cash” on the shift screen (₹4,250) means cash sales only or total drawer cash including the ₹2,500 opening amount.',
  D9: 'Two people are both named Arun: the supervisor and the RapidGo rider. One should be renamed.',
  D10: 'Where owner decisions are recorded, and how often they are reviewed.',
  D11: 'Raj’s role. The users list shows Raj as Retailer Administrator; the approval screen shows Raj as Store manager (MGR-014). The role list has no Store manager role.',
  D13: 'Whether customer returns need supervisor approval, and what happens to damaged returned goods. This screen completes returns without approval and says stock was updated.',
  D14: 'How many delivery reattempts are allowed before an order returns to the store.',
  D15: 'What the Owner column in Approval history means: the person who asked, or the person who decided.',
  D12: 'Where configuration changes are approved and recorded. Saving store, payment, drawer and signal settings writes no audit entry and keeps no version history.',
};

// ---- Tamil version (complete, separate text; chosen by the platform language selector)
const TA = /*@json:ta-lessons*/{};
const isTa = () => { try { return lang === 'ta'; } catch (e) { return false; } };
const U = en => isTa() ? (TA.ui[en] ?? en) : en;
const UT = (key, en, vars) => { let t = isTa() ? TA.uit[key] : en; for (const [k, v] of Object.entries(vars || {})) t = t.split('{' + k + '}').join(v); return t; };
const TM = m => { if (!isTa() || m === true || m == null) return m; m = String(m); if (TA.msg[m]) return TA.msg[m];
  for (const [re, t] of TA.pat) { const mm = m.match(new RegExp(re)); if (mm) return t === 'RESTORED' ? TA.uit.restored : t.replace(/\$(\d)/g, (_, i) => TA.word[mm[i]] || mm[i]); } return m; };
const TL = (c, i) => isTa() ? TA.courses[c]?.lessons[i] : null;
const lf = (c, i, f) => { const t = TL(c, i); return (t && t[f]) || COURSES[c].lessons[i][f]; };
const ctitle = c => isTa() && TA.courses[c] ? TA.courses[c].title : COURSES[c].title;
const stepText = (s, c, i) => { if (!isTa()) return txt(s.text);
  if (s.id === 'ready' && s.persona) return TA.shared.ready.replace('{persona}', TA.persona[s.persona]).replace('{screen}', TA.screen[s.screen]);
  if (s.id === 'empty') return TA.shared.empty;
  const v = TL(c, i)?.s?.[s.id]; const t = Array.isArray(v) ? v[0] : v; if (!t) return txt(s.text);
  return t.split('{RECEIPT}').join(mem.receipt ?? '').split('{NEXT}').join((mem.receipt ?? 0) + 1); };
const otherPageNote = () => { const L = window.AFM_PAGE_LINKS || {}; const url = isTa() ? L.ta : L.en;
  const t = isTa() ? 'தமிழ்க் குரல் விளக்கத்துடன் பயிற்சி பெற, தமிழ்ப் பயிற்சிப் பக்கத்தைத் திறங்கள்.' : 'For this training with English narration, open the English training page.';
  return url ? `<a href="${url}" target="_top">${t}</a>` : t; };
const askOf = (s, c, i) => { const t = TL(c, i)?.q?.[s.id]; return t ? {text: t[0], options: t[1], why: t[2]} : {text: s.text, options: s.options, why: s.why}; };
const verifyLabel = (s, c, i) => { const v = TL(c, i)?.s?.[s.id]; return Array.isArray(v) && v[1] ? v[1] : s.button; };

// ---- course content ------------------------------------------------------
const COURSES = {
cashier: {title: 'Cashier: Kavya on POS-01', lessons: [
 {title: 'Prepare the terminal', screen: 'sell', decisions: ['D1'],
  situation: 'It is 8:00 in the morning at AIFirstMart Ulundurpet Main Store. You are Kavya, the cashier on terminal POS-01. The store opens in a few minutes.',
  why: 'Every bill you create carries your name, the terminal and the time. At closing, your cash is checked against the ₹2,500 you started with. A wrong starting count makes an honest shift look short or over.',
  handoff: 'Nobody else receives anything yet. A ready terminal and a counted drawer are what you need for your first sale.',
  risk: 'If you sell under someone else’s login, or start without counting the drawer, a cash difference at closing cannot be traced to the right person or moment.',
  note: 'The header under the store name shows the role you are viewing as, and its scope. The top bar says Online; the terminal chip on the Sell screen says “Offline (practice)” because this practice terminal can simulate selling offline.',
  steps: [
   ready('cashier', 'sell'),
   {id: 'look', kind: 'read', target: () => q('.top .status'),
    text: 'Look at the top bar. In this practice system it shows <b>Online</b>, <b>Demo scanner</b> and <b>Printer not certified</b>. In the real store, the scanner and the printer must both be ready before your first sale.'},
   ask('printer', 'In the real store the printer shows “not certified”. What do you do?',
     ['Tell your supervisor before serving any customer', 'Start selling and fix the printer later', 'Move to another terminal without telling anyone'], 0,
     'A sale without a working printer cannot give the customer a receipt, and moving terminals without telling anyone breaks the cash count for both terminals.'),
   ask('float', 'How much cash must be in your drawer before the first sale?', ['₹2,500', '₹4,250', 'Nothing; the drawer starts empty'], 0,
     'The cash drawer setting for POS-01 has an opening amount of ₹2,500. ₹4,250 is the shift’s cash figure shown in the left menu, not the amount you start with.'),
  ]},
 {title: 'Scan the products', screen: 'sell', decisions: [],
  situation: 'It is 10:15. A customer places two packets of Aavin Milk 500 ml and a 1 kg pack of red onions on your counter.',
  why: 'This basket becomes the customer’s bill, the stock reduction and the audit record. If you tap the onion tile twice by mistake, the customer pays ₹42 more and stock shows a second kilo of onions leaving the shelf that never did.',
  handoff: 'Nobody else receives the basket yet. In the next lesson you check it yourself before asking for payment.',
  risk: 'A wrong product or a wrong quantity goes straight into the price, the stock record and the bill.',
  note: 'This training uses the Red Onion 1kg pack because the training location has no weighing scale. In the store, loose produce is sold by weight with ⚖ Weighed item and the store scale.',
  steps: [
   ready('cashier', 'sell'),
   {id: 'empty', kind: 'action', text: 'Start with an empty basket. If the basket already has items, choose <b>＋ New sale</b>.',
    target: () => P.cart().length ? q('[data-a="new"]') : null,
    check: () => P.cart().length === 0 || 'The basket is not empty. Choose ＋ New sale.'},
   {id: 'milk', kind: 'action', text: 'Scan the milk barcode <b>8901002</b> twice: type it in the scan box and press Enter, two times. (Or tap the Aavin Milk 500ml tile twice.)',
    target: () => q('#scan'),
    check: () => { const m = P.milk(); if (!m) return 'No milk in the basket yet.'; if (m.q === 1) return 'One packet scanned. Scan the second packet.'; if (m.q > 2) return `The basket shows ${m.q} packets, but the customer has 2. Use − on the milk line.`; return true; }},
   {id: 'onion', kind: 'action', text: 'Add the 1 kg pack of onions once (₹42.00): type its barcode <b>8901007</b> in the scan box and press Enter, or tap the <b>Red Onion 1kg</b> tile if it is showing.',
    target: () => vis(q('[data-add="8901007"]')) ? q('[data-add="8901007"]') : q('#scan'),
    check: () => { if (P.weighed().length) return 'A weighed onion line is in the basket. Choose Remove on it; in this training use the Red Onion 1kg tile.'; const o = P.onion(); if (!o) return 'The onions are not in the basket yet.'; if (o.q > 1) return `The basket shows ${o.q} kg of onions; the customer has one 1 kg pack. Use − on the onion line.`; return true; }},
   {id: 'sub', kind: 'verify', button: 'I have checked the basket', text: 'Check the basket. <b>Aavin Milk 500ml</b>: <b>₹26.00 each</b>, quantity <b>2</b>, <b>₹52.00</b>. <b>Red Onion 1kg</b>: <b>₹42.00 each</b>, quantity <b>1</b>, <b>₹42.00</b>. <b>Subtotal</b>: <b>₹94.00</b>.',
    target: () => q('#subtotal'),
    check: () => basketProblem() || (P.subtotal() === 94 || `Subtotal is ${rs(P.subtotal())}; it should be ₹94.00.`)},
  ]},
 {title: 'Check price, discount and tax', screen: 'sell', decisions: ['D2'],
  situation: 'The basket subtotal is ₹94.00. The customer shows a loyalty offer worth ₹5.',
  why: 'The price, discount and tax you confirm become the customer’s bill and decide how much the shop earns. Counter discounts add up to the discount figure the owner reviews every morning.',
  handoff: 'A discount above 10% goes to a supervisor in Approvals. Otherwise nobody else is involved and you move to payment.',
  risk: 'Typing 5 when you mean 5 percent gives ₹5 off, not 5%. Splitting one large discount into smaller ones bypasses the approval control.',
  note: 'This practice screen charges 5% tax on every product. Real GST rates depend on the product.',
  steps: [
   ready('cashier', 'sell', basketIntact),
   {id: 'over', kind: 'action', text: 'First see what happens above your limit. Choose <b>＋ Add</b> next to Discount, enter <b>12</b> (this box takes rupees, not percent), keep the reason, and choose <b>Apply / request approval</b>. ₹12 is 12.77% of ₹94.00, so it must not be applied.',
    target: () => isM('Apply discount') ? (q('#di')?.value !== '12' ? q('#di') : q('#apply')) : q('[data-a="discount"]'),
    check: () => { if (P.disc() > 0) return `A discount of ${rs(P.disc())} was applied. Choose ＋ New sale and rebuild the basket in lesson 2.`; return P.approvals().some(a => a.type === 'Discount' && a.amount === 12 && a.status === 'Pending') || 'No ₹12 request has been sent for approval yet.'; }},
   ask('own', 'The ₹12 request is now waiting in Approvals. Who can approve it?', ['A supervisor, never the cashier who asked', 'You, because you know the customer', 'Anyone at the counter'], 0,
     'The person who asks for an exception cannot approve it; that is what makes the 10% limit a real control.'),
   {id: 'apply', kind: 'action', text: 'Now apply the real offer. Choose <b>＋ Add</b> again, enter <b>5</b>, choose the reason <b>Loyalty offer</b>, and choose <b>Apply / request approval</b>. ₹5 is 5.32% of ₹94.00, within your limit.',
    target: () => isM('Apply discount') ? (q('#di')?.value !== '5' ? q('#di') : fval('#discountReason') !== 'Loyalty offer' ? q('#discountReason') : q('#apply')) : q('[data-a="discount"]'),
    check: () => P.disc() === 5 || (P.disc() ? `The discount shows ${rs(P.disc())}; it should be ₹5.00. Choose ＋ New sale and rebuild the basket in lesson 2.` : 'The ₹5 discount is not applied yet.')},
   ask('total', 'Read the basket. What is the total due now?', ['₹93.45', '₹98.70', '₹89.00'], 0,
     '₹94.00 − ₹5.00 = ₹89.00. This practice screen adds 5% tax, ₹4.45, so the total due is ₹93.45.'),
  ]},
 {title: 'Take payment safely', screen: 'sell', decisions: ['D3'],
  situation: 'The total due is ₹93.45. The customer wants to pay by UPI.',
  why: 'Complete sale records that the shop has been paid. If the payment actually failed, the customer leaves with goods the shop was never paid for, and it shows up only days later in settlement.',
  handoff: 'The payment record goes to Finance, who match it against the UPI provider’s settlement.',
  risk: 'Completing a sale on the customer’s word, or because the screen did not object, creates a payment the bank will never send.',
  note: 'In this practice system Complete sale always says “Payment successful”; it does not check with any terminal and does not calculate change for cash. The Sell screen says “Offline (practice)” but still accepts UPI.',
  steps: [
   ready('cashier', 'sell', () => basketIntact() === true ? (P.disc() === 5 || 'The ₹5 discount from lesson 3 is not applied. Go back to lesson 3.') : basketIntact()),
   {id: 'open', kind: 'action', text: 'Choose <b>₹ Pay</b>.', target: () => q('[data-a="pay"]'),
    check: () => isM('Take payment') || 'The payment window is not open.'},
   {id: 'upi', kind: 'action', text: 'Choose <b>UPI</b>. The customer scans the QR code on the payment terminal.',
    target: () => q('[data-pt="upi"]'),
    check: () => !isM('Take payment') ? 'Open the payment window with ₹ Pay.' : (P.payType() === 'upi' || 'UPI is not selected.')},
   {id: 'pay', kind: 'action',
    text: `Wait for the terminal. In this practice, the terminal shows: <span class="gt-terminal">UPI payment successful · ₹93.45 · Ref ${UPI_REF}</span>Type the reference <b>${UPI_REF}</b> into <b>Amount received / authorization reference</b>, replacing the amount, then choose <b>Complete sale</b>.`,
    target: () => isM('Take payment') ? (q('#payReference')?.value.trim() !== UPI_REF ? q('#payReference') : q('#modalFoot [data-a="complete"]')) : q('[data-a="pay"]'),
    check: () => { const p = mem.paid; if (!p) return 'The sale is not completed yet.'; return true; }},
  ]},
 {title: 'Issue the receipt and close the sale', screen: 'sell', decisions: [],
  situation: 'The UPI payment of ₹93.45 has succeeded and the sale is complete.',
  why: 'Only a completed sale counts. It records that the customer paid, that stock left the shop, and who sold it. A held or cancelled basket records none of this.',
  handoff: 'Your completed sale goes to Inventory, who reduce stock, and to Finance, who settle the UPI payment. The ₹5 discount is in the audit trail and becomes part of the discount figure the owner reviews.',
  risk: 'If you start the next customer before completing this sale, two baskets can mix and one customer may pay for the other’s items.',
  note: 'This practice receipt does not print discount or tax lines, so the item lines add up to ₹94.00 while the total is ₹93.45. A real tax invoice must show both. The on-hand stock count does not go down after a sale. The audit trail records the sale under your name and role: Kavya · Cashier.',
  steps: [
   {id: 'paid', kind: 'action', text: 'This lesson continues from the sale you completed in lesson 4.',
    check: () => mem.receipt ? true : 'No completed sale from lesson 4 was found. Complete lesson 4 first.'},
   {id: 'read', kind: 'read', target: () => q('#modalBody .receipt'),
    text: () => `Check the receipt before handing it over: <b>AIFirstMart, Ulundurpet Main Store</b>, the <b>GSTIN</b>, receipt <b>POS01-${mem.receipt}</b>, <b>Cashier Kavya</b> and the time, both items, <b>TOTAL ₹93.45</b> and <b>Paid by UPI</b>.`},
   ask('missing', 'The item lines add up to ₹94.00, but the total is ₹93.45. What is missing from this practice receipt?', ['The discount and tax lines', 'The payment method', 'The cashier’s name'], 0,
     '₹94.00 − ₹5.00 discount + ₹4.45 tax = ₹93.45. A real tax invoice must print both lines.'),
   {id: 'next', kind: 'action', text: () => `Hand over the receipt, then choose <b>Next sale</b>. The basket empties and the sale number changes to <b>Sale #POS01-${mem.receipt + 1}</b>. Closing here means finishing this one bill; closing your shift is a separate step with your supervisor.`,
    target: () => q('#modalFoot [data-a="next"]'),
    check: () => (P.sale() === mem.receipt + 1 && P.cart().length === 0 && !P.modal()) || 'Choose Next sale on the receipt.'},
  ]},
 {title: 'Take cash and give change', screen: 'sell', decisions: ['D3', 'D2'],
  situation: 'A customer buys one Tata Salt 1kg and pays with a ₹50 note.',
  why: 'Cash is the one payment the system cannot check for you. The amount you type and the change you hand back are the only record of what really happened at the counter.',
  handoff: 'Your cash sale adds to the drawer total the store manager counts at closing.',
  risk: 'Typing the total instead of the note you received, or handing back the wrong change, shows up only at closing as a difference nobody can trace.',
  note: 'The screen does not calculate change. Because 1 paisa coins are not used, change of ₹20.60 cannot be handed back exactly until the rounding rule is decided.',
  steps: [
   ready('cashier', 'sell'), emptyStep(),
   {id: 'salt', kind: 'action', text: 'Scan <b>8901004</b> (Tata Salt 1kg, ₹28.00) once.', target: () => q('#scan'),
    check: () => { const x = P.cart().find(i => i.id === '8901004'); if (!x) return 'The salt is not in the basket yet.'; if (x.q !== 1 || P.cart().length !== 1) return 'The basket should hold exactly one Tata Salt 1kg.'; return true; }},
   ask('due', 'What is the total due?', ['₹29.40', '₹28.00', '₹30.00'], 0, '₹28.00 plus this practice screen’s 5% tax of ₹1.40 is ₹29.40.'),
   {id: 'pay', kind: 'action', text: 'Choose <b>₹ Pay</b>, choose <b>Cash</b>, type <b>50</b>, the note the customer handed you, in <b>Amount received / authorization reference</b>, and choose <b>Complete sale</b>.',
    target: () => isM('Take payment') ? (P.payType() !== 'cash' ? q('[data-pt="cash"]') : fval('#payReference') !== '50' ? field('#payReference') : field('#modalFoot [data-a="complete"]')) : q('[data-a="pay"]'),
    completeCheck: () => P.payType() !== 'cash' ? 'Choose Cash first.' : (q('#payReference')?.value || '').trim() !== '50' ? 'Type 50, the amount the customer handed you, not the total.' : P.total() !== 29.4 ? `The total is ${rs(P.total())}, not ₹29.40. Start again with one Tata Salt 1kg.` : null,
    afterComplete: n => { mem.answers['cashier-5-receipt'] = n; },
    check: () => mem.answers['cashier-5-receipt'] ? true : 'The sale is not completed yet.'},
   ask('change', 'The customer gave ₹50.00 for a total of ₹29.40. How much change is due?', ['₹20.60', '₹21.40', '₹20.00'], 0, '₹50.00 − ₹29.40 = ₹20.60. Count it back to the customer, starting from the total.'),
   {id: 'next', kind: 'action', text: 'Hand over the change and the receipt, then choose <b>Next sale</b>.', target: () => q('#modalFoot [data-a="next"]'),
    check: () => (P.sale() === mem.answers['cashier-5-receipt'] + 1 && !P.modal()) || 'Choose Next sale on the receipt.'},
  ]},
 {title: 'Hold a sale and serve the next customer', screen: 'sell', decisions: [],
  situation: 'A customer has a packet of Marie Gold biscuits on your counter, then realises her wallet is in the car. Another customer is waiting behind her.',
  why: 'Holding keeps the first basket safe without making the queue wait, and without you rebuilding the same basket from memory.',
  handoff: 'The held basket stays on this terminal until you resume it.',
  risk: 'Clearing a basket to serve the next customer, then rebuilding it from memory, is how items get missed or charged twice.',
  note: 'Held sales are kept on this terminal only, and the held list shows the total but not the items.',
  steps: [
   ready('cashier', 'sell'), emptyStep(),
   {id: 'add', kind: 'action', text: 'Scan <b>8901006</b> (Marie Gold 250g, ₹35.00) once.', target: () => q('#scan'),
    check: () => { const x = P.cart().find(i => i.id === '8901006'); return (x && x.q === 1 && P.cart().length === 1) || 'The basket should hold exactly one Marie Gold 250g.'; }},
   {id: 'hold', kind: 'action', text: 'Choose <b>Hold</b>. The basket empties and <b>Held sales</b> shows 1.', target: () => q('[data-a="hold"]'),
    check: () => { try { return (P.cart().length === 0 && held.some(h => h.cart.some(i => i.id === '8901006'))) || 'The basket has not been held yet.'; } catch (e) { return 'Held sales are not available.'; } }},
   ask('where', 'The basket is empty now. Where is the first customer’s biscuit packet?', ['In Held sales on this terminal', 'It has been sold', 'It has been deleted'], 0, 'Holding parks the basket without selling or deleting it.'),
   {id: 'resume', kind: 'action', text: 'She is back with her wallet. Choose <b>⏱ Held sales</b>, then <b>Resume</b> on the held sale of <b>₹36.75</b>.',
    target: () => isM('Held sales') ? q('#overlay.show [data-resume]') : q('[data-a="resume"]'),
    check: () => { try { const x = P.cart().find(i => i.id === '8901006'); return (x && !held.some(h => h.cart.some(i => i.id === '8901006'))) || 'Resume the held sale.'; } catch (e) { return 'Held sales are not available.'; } }},
  ]},
 {title: 'Handle an unknown barcode', screen: 'sell', decisions: [],
  situation: 'A customer brings a pot of Aavin Curd 400g. You scan its barcode, 8901099, and the system says the product is not in the catalogue.',
  why: 'Every product sold must exist in the catalogue with the right price and tax. Selling it under another product’s barcode makes the bill, the tax and the stock wrong for two products at once.',
  handoff: 'Your report goes to the catalogue team as a review task. They add the product with its approved price.',
  risk: 'Guessing a price, or scanning a similar product instead, puts a wrong price on the bill and wrong stock on two products.',
  note: 'Submitting creates a review task but writes no audit entry. The screen does not say what to do with the customer’s item while the review is pending; ask your supervisor. In this practice system, codes such as 8901002 are the shop’s own item codes printed on shelf labels and scanned at the till. Real packs carry 13-digit GTIN barcodes; the platform will hold those in a separate field.',
  steps: [
   ready('cashier', 'sell'), emptyStep(),
   {id: 'scan', kind: 'action', text: 'Type <b>8901099</b> in the scan box and press Enter.', target: () => q('#scan'),
    check: () => isM('Product not found') || 'Scan 8901099.'},
   {id: 'report', kind: 'action', text: 'In <b>Product name</b>, type <b>Aavin Curd 400g</b>, exactly as printed on the pot, and choose <b>Submit for review</b>.',
    target: () => isM('Product not found') ? (!/curd|தயிர்/i.test(field('#modalBody input')?.value || '') ? field('#modalBody input') : field('#modalFoot [data-a="submit"]')) : q('#scan'),
    guard: {sel: '#modalFoot [data-a="submit"]', check: () => /aavin curd 400g|ஆவின் தயிர் 400/i.test((field('#modalBody input')?.value || '').trim()) ? null : 'Type the name as printed: Aavin Curd 400g.'},
    check: () => committed('#modalFoot [data-a="submit"]') || 'Not submitted yet.'},
   ask('similar', 'Can you sell the curd by scanning a similar product with a known price?', ['No; never sell under another product’s barcode', 'Yes, if the price is close', 'Yes, if the customer agrees'], 0, 'The bill, the tax and the stock of both products would be wrong.'),
  ]},
 {title: 'Process a customer return', screen: 'sell', decisions: ['D13'],
  situation: 'A customer brings back the Aashirvaad Atta 5kg she bought on receipt POS01-1042. The bag is torn. The same receipt also shows two packets of Tata Salt, which she is keeping.',
  why: 'A return reverses part of a sale: money goes back to the customer and the item comes back into the shop’s records. It must match the original receipt, or the shop refunds money it never received.',
  handoff: 'The refund goes back through the original payment method, for Finance to match. The returned item goes to the stock team.',
  risk: 'Refunding without the original receipt, refunding items the customer is keeping, or paying cash for a card sale are the commonest ways money leaves a shop by mistake.',
  note: 'This screen completes the return without supervisor approval, and its message says stock was updated even though a torn bag should not go back on sale. It writes no audit entry.',
  steps: [
   ready('cashier', 'sell'),
   {id: 'find', kind: 'action', text: 'Choose <b>↩ Return</b>. Check <b>Receipt number: POS01-1042</b>, set <b>Reason: Damaged product</b>, and choose <b>Find receipt</b>.',
    target: () => isM('Return sale') ? field('#findReturn') : q('[data-a="return"]'),
    guard: {sel: '#findReturn', check: () => fval('#returnReceipt') !== 'POS01-1042' ? 'The customer’s receipt is POS01-1042.' : fval('#modalBody select') !== 'Damaged product' ? 'Set Reason to Damaged product; the bag is torn.' : null},
    check: () => isM('Select return items') || 'Find the receipt first.'},
   {id: 'items', kind: 'action', text: 'Tick only <b>Aashirvaad Atta 5kg</b> (₹294); leave <b>Tata Salt 1kg</b> unticked. Keep <b>Refund method: Original payment method</b>. Choose <b>Complete return</b>.',
    target: () => isM('Select return items') ? field('#completeReturn') : null,
    guard: {sel: '#completeReturn', check: () => { const c = [...document.querySelectorAll('#overlay.show #modalBody input[type=checkbox]')].map(x => x.checked); const r = fval('#modalBody select'); return !c[0] ? 'Tick Aashirvaad Atta 5kg; that is what she is returning.' : c[1] ? 'Untick Tata Salt; she is keeping it.' : r !== 'Original payment method' ? 'Refund to the original payment method.' : null; }},
    check: () => committed('#completeReturn') || 'The return is not completed yet.'},
   ask('method', 'The atta was paid for by card. Why refund to the original payment method?', ['The money goes back the way it came, so Finance can match it', 'Cash is quicker for everyone', 'The customer may choose any method'], 0, 'A refund that mirrors the original payment can be matched to the sale; cash for a card sale cannot.'),
  ]}
]},

manager: {title: 'Store manager: Raj, Ulundurpet Main Store', lessons: [
 {title: 'Open the store day', screen: 'command', decisions: ['D1'],
  situation: 'It is 8:00 in the morning. You are Raj, the store manager at Ulundurpet Main Store. Before the doors open, you check whether today can run safely: sales against target, orders due, decisions waiting and people on shift.',
  why: 'Everything the cashier, pickers and riders do today depends on the plan you check now. A gap you spot at 8 AM is one phone call; the same gap found at 4 PM is a queue of unhappy customers.',
  handoff: 'You receive the store plan from the owner. During the day, your team receives clear assignments from you.',
  risk: 'If you start the day without checking coverage and waiting approvals, problems surface only when customers complain.',
  note: 'The Command center shows 23 open orders, while the Orders screen lists 5. The left menu shows Shift #A-042 with Cash ₹4,250.',
  steps: [
   ready('manager', 'command'),
   {id: 'read', kind: 'read', target: () => q('#command .command-grid'),
    text: 'Read the four figures (L means lakh). <b>Sales today</b> <b>₹1.84L</b>, <b>94% of target</b>. <b>Open orders</b> <b>23</b>, <b>5 due in 60 min</b>. <b>Pending approvals</b> <b>4</b>, <b>Oldest 18 min</b>. <b>Shift coverage</b> <b>11 / 12</b>, <b>One gap at 4 PM</b>.'},
   ask('cover', 'Shift coverage shows one gap at 4 PM. When do you act?', ['Now, before the store opens: arrange cover for 4 PM', 'At 4 PM, when the gap appears', 'Only if a customer complains'], 0,
     'A gap you know about in the morning can be covered with one call. At 4 PM the only option is a longer queue.'),
   ask('wait', 'Four approvals are pending, and the oldest has waited 18 minutes. Why does that matter?', ['Someone, a cashier or a customer, may be waiting on each decision', 'It does not; approvals can wait until closing', 'Pending requests are approved automatically'], 0,
     'An approval request usually means a sale or a stock change is on hold until you decide.'),
  ]},
 {title: 'Match orders to team capacity', screen: 'orders', decisions: [],
  situation: 'It is 12:50. Priya’s WhatsApp order AFM-WA-8821, 8 items worth ₹1,286, is promised for Express Delivery at 1:35 PM. Nobody has been assigned to pick it.',
  why: 'An order nobody is assigned to is an order nobody is picking. Every minute it waits comes out of the customer’s promise time.',
  handoff: 'Your assignment goes straight to the picker’s mobile app. The picker then hands sealed bags to logistics.',
  risk: 'Assigning work to someone who is already busy, or to a device already in use, makes the order wait while it looks assigned.',
  note: 'Team capacity lists Kavya, the cashier, as packing an order. The pick-by time is fixed at 1:05 PM in this dialog.',
  setup: () => { try { const id = 'AFM-WA-8821', a = assignmentMeta[id], o = orderData.find(x => x.id === id); if (a && o && a.picker !== 'Unassigned') { Object.assign(a, {picker: 'Unassigned', packer: 'Unassigned', device: 'Not assigned', assigned: '—'}); o.status = 'agreed'; o.picker = 'Unassigned'; savePortalState(); renderOrdersV2(); } } catch (e) {} },
  steps: [
   ready('manager', 'orders'),
   {id: 'cap', kind: 'action', text: 'Choose <b>Team capacity</b> and read who is busy.',
    target: () => isM('Team capacity') ? q('#modalFoot [data-a="cancel"]') : q('#orders [data-ord="capacity"]'),
    check: seen('manager-1-cap', 'Team capacity', 'Read the list, then choose Done.', 'Choose Team capacity.')},
   ask('free', 'Team capacity shows Arun picking 1 order, Kavya packing 1 order, and Meena available. Who takes AFM-WA-8821?', ['Meena', 'Arun', 'Kavya'], 0,
     'Meena is the only person with no order in hand. Arun is already picking, and Kavya is packing as well as running the till.'),
   {id: 'assign', kind: 'action',
    text: 'On <b>AFM-WA-8821</b>, choose <b>Assign order</b>. Set <b>Picker: Meena</b>, <b>Packer: Meena</b>, and <b>Picker device: Mobile · PM-02</b>; PM-03 is already in use by Arun. Choose <b>Assign & send</b>.',
    target: () => isM('Assign order') ? (fval('#assignPicker') !== 'Meena' ? field('#assignPicker') : !['Meena', 'Same as picker'].includes(fval('#assignPacker')) ? field('#assignPacker') : fval('#assignDevice') !== 'Mobile · PM-02' ? field('#assignDevice') : field('#confirmAssignment')) : q('[data-orderassign="AFM-WA-8821"]'),
    guard: {sel: '#confirmAssignment', check: () => fval('#assignPicker') !== 'Meena' ? 'Set Picker to Meena; she is the only one available.' : !['Meena', 'Same as picker'].includes(fval('#assignPacker')) ? 'Set Packer to Meena. Kavya is running the till and already packing.' : fval('#assignDevice') !== 'Mobile · PM-02' ? 'Set Picker device to Mobile · PM-02. PM-03 is in use by Arun.' : null},
    check: () => { try { const a = assignmentMeta['AFM-WA-8821']; return (a.picker === 'Meena' && a.device === 'Mobile · PM-02') || 'AFM-WA-8821 is not assigned to Meena on Mobile · PM-02 yet.'; } catch (e) { return 'The order queue is not available.'; } }},
  ]},
 {title: 'Resolve a stock count difference', screen: 'stock', decisions: [],
  situation: 'Meena’s count sheet for the low-stock check reads: Aashirvaad Atta 5kg 18, Aavin Milk 500ml 30, Ponni Rice 5kg 11, Tata Salt 1kg 44. The system shows 32 packets of Aavin Milk.',
  why: 'The stock on screen decides what customers can order online and what gets reordered. If the system says 32 packets of milk and the shelf has 30, two online customers may be promised milk that is not there.',
  handoff: 'The count goes for approval. Only an approved count changes the stock record, and the difference is investigated.',
  risk: 'Typing the system number into the count box to make a difference disappear hides theft, damage or a receiving error.',
  note: 'The Physical count boxes start filled with the system quantity; replace each one with what was actually counted. Submitting shows a confirmation but writes no audit entry.',
  steps: [
   ready('manager', 'stock'),
   {id: 'count', kind: 'action',
    text: 'Choose <b>Start count</b>. Keep <b>Count scope: Low-stock products</b> and <b>Assign to: Meena · Stock associate</b>. In <b>Physical count</b>, enter what Meena counted: <b>Aashirvaad Atta 5kg</b> 18, <b>Aavin Milk 500ml</b> 30, <b>Ponni Rice 5kg</b> 11, <b>Tata Salt 1kg</b> 44. Choose <b>Submit count</b>.',
    target: () => { if (!isM('Start cycle count')) return q('#stock [data-a="count"]'); const ins = [...document.querySelectorAll('#overlay.show #modalBody table input')]; const want = ['18', '30', '11', '44']; const bad = ins.find((x, i) => x.value.trim() !== want[i]); return bad || field('#submitCount'); },
    guard: {sel: '#submitCount', check: () => { const ins = [...document.querySelectorAll('#overlay.show #modalBody table input')].map(x => x.value.trim()); const names = ['Atta', 'Milk', 'Rice', 'Salt'], want = ['18', '30', '11', '44']; const i = want.findIndex((w, k) => ins[k] !== w); if (i >= 0) return `Enter ${want[i]} for ${names[i]}: that is what Meena counted.`; const who = englishVal([...document.querySelectorAll('#overlay.show #modalBody select')][1]); return /Meena/.test(who) ? null : 'Assign the count to Meena · Stock associate; it is her count sheet.'; }},
    check: () => committed('#submitCount') || 'The count has not been submitted yet.'},
   ask('after', 'Meena counted 30 packets of milk; the system shows 32. What happens to the stock record now?', ['It changes only after the difference is approved', 'It changes to 30 immediately', 'Nothing; a count is only for information'], 0,
     'The system confirmed: “variances routed for approval”. The record changes once the difference is approved, and someone investigates the two missing packets.'),
  ]},
 {title: 'Approve independently', screen: 'approvals', decisions: ['D7'],
  situation: 'Request APR-1042 is waiting. Kavya, the cashier, asked for a 12% discount worth ₹186. Her limit is 10%, and no reason is recorded.',
  why: 'An approval only protects the shop when the person deciding is not the person asking. The system enforces this, but only if each approver signs in as themselves.',
  handoff: 'Your signed decision is recorded with your name, manager ID and time, and goes back to Kavya.',
  risk: 'If the requester is allowed to use the approval, or a manager approves without a reason, the 10% limit stops meaning anything.',
  note: 'After you sign, the APR-1042 row in the table still shows Pending; your decision is in the Audit screen. The Review button on the row opens an older dialog that does not record a decision.',
  steps: [
   ready('manager', 'approvals'),
   {id: 'sod', kind: 'action', guard2: {sel: '#approvals [data-a="approve"]', check: () => 'Do not use Review → on the table row. That older window does not record a decision. Use the panel this step names.'},
    text: 'First see the control work. Choose <b>🔐 Independent approval</b>. Set <b>Independent approver</b> to <b>Kavya · Cashier · requester</b> and choose <b>Sign and commit decision</b>. The system must refuse.',
    target: () => isM('Independent authenticated approval') ? (/Kavya/.test(fval('#strongApprover')) ? field('#commitStrongApproval') : field('#strongApprover')) : q('#approvals [data-strong-approval]'),
    check: () => (committed('#commitStrongApproval') && /Kavya/.test(fval('#strongApprover'))) || 'Not refused yet. Choose Kavya as approver and sign.'},
   {id: 'decide', kind: 'action', guard2: {sel: '#approvals [data-a="approve"]', check: () => 'Do not use Review → on the table row. That older window does not record a decision. Use the panel this step names.'},
    text: 'Now sign as yourself. Set <b>Independent approver: Raj · Store manager · MGR-014</b>, keep the step-up authentication, set <b>Reason / decision: Reject</b> because no reason was given, and choose <b>Sign and commit decision</b>.',
    target: () => isM('Independent authenticated approval') ? (!/Raj/.test(fval('#strongApprover')) ? field('#strongApprover') : fval('#strongDecision') !== 'Reject' ? field('#strongDecision') : field('#commitStrongApproval')) : q('#approvals [data-strong-approval]'),
    guard: {sel: '#commitStrongApproval', check: () => !/Raj/.test(fval('#strongApprover')) ? 'Set Independent approver to Raj · Store manager · MGR-014.' : fval('#strongDecision') !== 'Reject' ? 'No reason was recorded for this discount. Set Reason / decision to Reject.' : null},
    check: () => newAudit(/Independently authenticated decision.*APR-1042/) || 'Your decision is not recorded yet.'},
  ]},
 {title: 'Close and reconcile the shift', screen: 'sell', decisions: ['D8'],
  situation: 'It is 9:00 at night. The system expects ₹4,250 in cash for POS-01. You count the drawer with Kavya and find ₹4,200.',
  why: 'A shift is finished only when the counted cash matches what the system expects, or the difference is recorded with its reason. A ₹50 difference is easy to explain tonight; found a week later, it never will be.',
  handoff: 'The shift result goes to Finance. A difference goes for approval with its reason.',
  risk: 'Typing the expected amount instead of the counted amount makes the shift look balanced and hides the shortage.',
  note: 'This dialog does not show the expected amount; in this practice data it is ₹4,250. The dialog also accepts “No variance” when there is one, so choose the reason that matches your count.',
  setup: () => { try { Object.assign(closureState.pos, {counted: 4250, variance: 0, status: 'Open'}); closureSave(); } catch (e) {} },
  steps: [
   ready('manager', 'sell'),
   ask('var', 'You counted ₹4,200; the system expects ₹4,250. What is the variance?', ['−₹50, a shortage', '+₹50, an excess', 'None; it is close enough'], 0,
     '₹4,200 − ₹4,250 = −₹50. Every difference is recorded, however small.'),
   {id: 'close', kind: 'action',
    text: 'Choose <b>Close & reconcile shift</b>. Type the counted cash <b>4200</b>. Set <b>Variance reason: Cash shortage</b>. In <b>Supervisor note</b>, write what you checked. Choose <b>Close and settle</b>.',
    target: () => isM('Count and close shift') ? (fval('#countedCash') !== '4200' ? field('#countedCash') : fval('#varianceReason') !== 'Cash shortage' ? field('#varianceReason') : field('#commitShift')) : q('#sell [data-module="shiftReconcile"]'),
    guard: {sel: '#commitShift', check: () => fval('#countedCash') !== '4200' ? 'Type the cash you counted: 4200, not the expected amount.' : fval('#varianceReason') !== 'Cash shortage' ? 'The count is ₹50 short. Set Variance reason to Cash shortage.' : !fval('#closeNote') ? 'Write a short note on what you checked.' : null},
    check: () => { try { const p = closureState.pos; return (p.counted === 4200 && p.variance === -50 && p.status === 'Approval required') || 'The shift is not closed with the ₹50 shortage yet.'; } catch (e) { return 'Shift data is not available.'; } }},
  ]},
 {title: 'Get customer consent for a substitution', screen: 'orders', decisions: [],
  situation: 'Fathima’s WhatsApp order AFM-WA-8817 includes Aavin Milk 500ml, which is unavailable for her order. The team offered Heritage Milk 500ml, ₹2 more. Fathima replied on WhatsApp: yes, Heritage is fine.',
  why: 'A substitute changes what the customer receives and what she pays. Only her recorded answer makes that change fair, and protects the shop if she complains later.',
  handoff: 'Your decision reprices the order and updates the reservation; the picker then picks Heritage instead of Aavin.',
  risk: 'Swapping or repricing without the customer’s recorded consent turns a helpful substitute into a complaint and a refund.',
  note: 'This store’s Sell screen shows Aavin Milk in stock, while this order records it as unavailable.',
  setup: () => { try { const x = closureState.substitutions.find(s => s.id === 'SUB-8817'); if (x) { x.status = 'Awaiting customer'; closureSave(); } } catch (e) {} },
  steps: [
   ready('manager', 'orders'),
   {id: 'open', kind: 'action', text: 'Choose <b>Substitution queue</b>.', target: () => q('#orders [data-module="substitution"]'),
    check: () => isM('Substitution') || 'Choose Substitution queue.'},
   {id: 'decide', kind: 'action', text: 'Record what Fathima said: <b>Offered substitute: Heritage Milk 500ml · +₹2</b>, <b>Customer decision: Approved in WhatsApp</b>, <b>Price treatment: Charge difference</b>. Choose <b>Confirm decision</b>.',
    target: () => isM('Substitution') ? (!/Heritage/.test(fval('#subOffer')) ? field('#subOffer') : fval('#subDecision') !== 'Approved in WhatsApp' ? field('#subDecision') : fval('#subPrice') !== 'Charge difference' ? field('#subPrice') : field('#commitSub')) : q('#orders [data-module="substitution"]'),
    guard: {sel: '#commitSub', check: () => !/Heritage/.test(fval('#subOffer')) ? 'Fathima agreed to Heritage Milk 500ml.' : fval('#subDecision') !== 'Approved in WhatsApp' ? 'She approved in WhatsApp.' : fval('#subPrice') !== 'Charge difference' ? 'She accepted the ₹2 difference, so charge it.' : null},
    check: () => newAudit(/Substitution decision.*SUB-8817/) || 'The decision is not recorded yet.'},
   ask('noreply', 'If Fathima had not replied by the time picking starts, which decision would you record?', ['No response · refund item', 'Approved in WhatsApp', 'Send Heritage and waive the increase'], 0, 'Without her answer there is no consent, so the item is refunded rather than swapped.'),
  ]},
 {title: 'Resolve a failed delivery', screen: 'delivery', decisions: ['D14'],
  situation: 'Delivery DLV-3318 has failed: the customer was not at home. The rider has brought the bags back to the store. The customer has replied that she will be home this evening.',
  why: 'A failed delivery leaves three loose ends: the customer still wants her order, the goods are sitting in the store, and the payment must stay matched. Your decision ties all three together.',
  handoff: 'The system creates the delivery, payment and inventory actions; logistics books the reattempt and the customer is notified.',
  risk: 'Leaving returned bags without a decision means chilled items spoil, and the customer is neither delivered to nor refunded.',
  note: 'This dialog shows the delivery number only: not the order, the number of bags or how many attempts have been made. Ask logistics for these before deciding.',
  setup: () => { try { const x = closureState.failed.find(f => f.id === 'DLV-3318'); if (x) { x.status = 'Action required'; closureSave(); } } catch (e) {} },
  steps: [
   ready('manager', 'delivery'),
   {id: 'open', kind: 'action', text: 'Choose <b>Open exception</b> on Failed delivery & RTO.', target: () => q('#delivery [data-module="failedDelivery"]'),
    check: () => isM('Resolve failed delivery') || 'Choose Open exception.'},
   {id: 'decide', kind: 'action', text: 'Set <b>Reason: Customer unavailable</b>, <b>Resolution: Schedule reattempt</b>, <b>Inventory disposition: Hold in return staging</b>, <b>Customer notification: WhatsApp + app notification</b>. Choose <b>Apply resolution</b>.',
    target: () => isM('Resolve failed delivery') ? (fval('#failReason') !== 'Customer unavailable' ? field('#failReason') : fval('#failResolution') !== 'Schedule reattempt' ? field('#failResolution') : fval('#failStock') !== 'Hold in return staging' ? field('#failStock') : field('#commitFailed')) : q('#delivery [data-module="failedDelivery"]'),
    guard: {sel: '#commitFailed', check: () => fval('#failReason') !== 'Customer unavailable' ? 'The reason was Customer unavailable.' : fval('#failResolution') !== 'Schedule reattempt' ? 'She will be home this evening and still wants the order: schedule a reattempt.' : fval('#failStock') !== 'Hold in return staging' ? 'Hold the bags in return staging; they go out again on the reattempt.' : null},
    check: () => newAudit(/Failed delivery resolved.*DLV-3318/) || 'The resolution is not recorded yet.'},
   ask('why', 'Why hold the bags in return staging instead of restocking them?', ['The customer still wants them; they go out on the reattempt', 'Restocking is slower', 'Return staging is only for damaged goods'], 0, 'Restocking would put her goods back on sale while she is still waiting for them.'),
  ]},
 {title: 'Take a phone order with the right payment', screen: 'orders', decisions: [],
  situation: 'Lakshmi phones the store. She wants the Essentials basket, 6 items worth ₹846, delivered by Express Delivery, and she wants to pay cash on delivery.',
  why: 'The shop’s rule is that Express Delivery must be paid in advance. Knowing the rule before you promise anything lets you offer the customer a choice that works.',
  handoff: 'The new order enters the Agreed queue, ready to assign to a picker.',
  risk: 'Promising an option the system will refuse wastes the customer’s time and yours. Explain the choice before creating the order.',
  note: 'The system generates the order number. In this practice system the new order is recorded in the audit trail, but a display error stops it appearing in the Orders list.',
  steps: [
   ready('manager', 'orders'),
   {id: 'try', kind: 'action', text: 'Choose <b>＋ Create order</b>. Keep Lakshmi and the <b>Essentials basket</b>. Set <b>Fulfilment preference: Express Delivery</b> and <b>Payment: COD</b>, then choose <b>Validate & create</b>. Read what the system says.',
    target: () => isM('Create assisted order') ? (fval('#newMode') !== 'Express Delivery' ? field('#newMode') : fval('#newPay') !== 'COD' ? field('#newPay') : field('#createAssistedOrder')) : q('#orders [data-ord="newOrder"]'),
    check: () => q('#newOrderRule')?.className === 'danger-note' || 'Try Express Delivery with COD and choose Validate & create.'},
   ask('offer', 'Lakshmi still wants to pay cash. What can you offer her?', ['Planned Delivery, today 4 to 6 PM, with COD', 'Express Delivery with COD anyway', 'Nothing; cash orders are not allowed'], 0, 'Planned Delivery accepts COD. Express needs payment in advance.'),
   {id: 'create', kind: 'action', text: 'She agrees. Set <b>Fulfilment preference: Planned Delivery</b>, keep <b>Payment: COD</b> and the <b>Essentials basket</b>, and choose <b>Validate & create</b>.',
    target: () => isM('Create assisted order') ? (fval('#newMode') !== 'Planned Delivery' ? field('#newMode') : field('#createAssistedOrder')) : q('#orders [data-ord="newOrder"]'),
    guard: {sel: '#createAssistedOrder', check: () => fval('#newMode') !== 'Planned Delivery' ? 'Set Fulfilment preference to Planned Delivery.' : fval('#newPay') !== 'COD' ? 'Keep Payment as COD; that is what she asked for.' : !/Essentials/.test(fval('#newBasket')) ? 'Keep the Essentials basket.' : null},
    check: () => newAudit(/Order created.*planned/) || 'The order is not created yet.'},
  ]},
 {title: 'Receive a supplier delivery', screen: 'stock', decisions: [],
  situation: 'The Aavin distributor delivers milk against purchase order PO-2026-0918. The invoice says 24 packets of Aavin Milk 500ml. You count 24 packets. The packets show batch AV1001, expiry 04/10/2026.',
  why: 'Stock on the system should go up only when goods are physically in the store and checked. An invoice proves what was billed, not what arrived.',
  handoff: 'The received stock becomes available to sell and to promise online. Finance later matches the receipt, the purchase order and the invoice before paying the supplier.',
  risk: 'Posting the invoice quantity without counting means any shortage is paid for, then appears later as a stock loss.',
  note: 'Posting a receipt updates on-hand stock but writes no audit entry. The batch and expiry box starts with a sample value; replace it with what is printed on the packets.',
  setup: () => { const m = item('8901002'); mem.answers['manager-8-base'] = m ? m.s : null; },
  steps: [
   ready('manager', 'stock'),
   {id: 'post', kind: 'action', text: 'Choose <b>Receive stock</b>. Set <b>Supplier: Aavin Distributor</b>, purchase order <b>PO-2026-0918</b>, <b>Product: Aavin Milk 500ml</b>, <b>Received quantity: 24</b>, and batch / expiry <b>AV1001 · 04/10/2026</b>. Choose <b>Post receipt</b>.',
    target: () => { if (!isM('Receive stock')) return q('#stock [data-a="receive"]'); const v = modalInputs(); return mtext(v[0]) !== 'Aavin Distributor' ? v[0] : mtext(v[1]) !== 'PO-2026-0918' ? v[1] : mtext(v[2]) !== 'Aavin Milk 500ml' ? v[2] : mtext(v[3]) !== '24' ? v[3] : !(/1001/.test(mtext(v[4])) && /04\/10\/2026/.test(mtext(v[4]))) ? v[4] : field('#postReceipt'); },
    guard: {sel: '#postReceipt', check: () => { const v = modalInputs().map(mtext); return v[0] !== 'Aavin Distributor' ? 'The supplier is Aavin Distributor.' : v[1] !== 'PO-2026-0918' ? 'The purchase order is PO-2026-0918.' : v[2] !== 'Aavin Milk 500ml' ? 'Set Product to Aavin Milk 500ml.' : v[3] !== '24' ? 'Enter 24, the number you counted.' : !(/1001/.test(v[4]) && /04\/10\/2026/.test(v[4])) ? 'Type the batch and expiry printed on the packets: AV1001 · 04/10/2026.' : null; }},
    check: () => { const m = item('8901002'), b = mem.answers['manager-8-base']; return (m && b != null && m.s === b + 24) || 'The receipt is not posted yet.'; }},
   ask('short', 'If you had counted only 22 packets, what would you post?', ['22, and report the 2-packet shortage to the supplier', '24, because the invoice says 24', 'Nothing until the supplier calls'], 0, 'You post what physically arrived. The shortage is raised with the supplier before the invoice is paid.'),
  ]},
 {title: 'Write off damaged stock', screen: 'stock', decisions: [],
  situation: 'While shelving the delivery, one packet of Aavin Milk bursts. It cannot be sold.',
  why: 'If a damaged item stays in the system, the store promises customers stock it does not have, and the next count shows a difference nobody can explain.',
  handoff: 'The adjustment updates the stock record, and the reason tells Finance this was damage, not a sale.',
  risk: 'Throwing the packet away without recording it turns a known loss into a mystery shortage at the next count.',
  note: 'Adjustments are recorded in the audit trail with product, quantity and reason.',
  steps: [
   ready('manager', 'stock'),
   {id: 'adjust', kind: 'action', text: 'Choose <b>Inventory operations</b>. On <b>Adjustment</b>, set <b>Product: Aavin Milk 500ml</b>, quantity <b>-1</b>, and <b>Reason: Damage / write-off</b>. Choose <b>Post adjustment</b>.',
    target: () => isM('Inventory operations') ? (!/Aavin Milk/.test(fval('#invProduct')) ? field('#invProduct') : fval('#invQty') !== '-1' ? field('#invQty') : fval('#invReason') !== 'Damage / write-off' ? field('#invReason') : field('[data-fn="postAdjustment"]')) : q('#stock [data-fn="inventoryCentre"]'),
    guard: {sel: '[data-fn="postAdjustment"]', check: () => !/Aavin Milk/.test(fval('#invProduct')) ? 'Set Product to Aavin Milk 500ml.' : fval('#invQty') !== '-1' ? 'Enter -1: one packet is lost.' : fval('#invReason') !== 'Damage / write-off' ? 'Set Reason to Damage / write-off.' : null},
    check: () => newAudit(/Adjustment posted.*· -1 ·/) || 'The adjustment is not posted yet.'},
   ask('now', 'Why record the −1 now instead of letting the next count find it?', ['The reason, damage, is recorded while it is known', 'It makes no difference', 'Counts correct everything automatically'], 0, 'A count can find a difference, but it cannot tell you why it happened.'),
  ]}
]},
owner: {title: 'Business owner', lessons: [
 {title: 'Read business health', screen: 'command', decisions: ['D4', 'D5'],
  situation: 'It is 9:00 in the morning. You own AIFirstMart, and before you speak to any manager you open the Command center.',
  why: 'Sales above plan look like good news. When discount leakage is also above plan, part of that growth may have been bought with discounts. Sales show what came in; contribution shows what the shop kept.',
  handoff: 'Nobody receives anything yet. You choose what to investigate next.',
  risk: 'If you read only the sales figure, you may celebrate growth while margin quietly falls.',
  note: 'The Command center shows no period for its figures and no margin plan to compare 20.9% against.',
  steps: [
   ready('owner', 'command'),
   {id: 'read', kind: 'read', target: () => q('#command .command-grid'),
    text: 'Read the four figures in pairs (L means lakh). <b>Net sales</b> <b>₹8.42L</b>, <b>↑ 7.8% vs plan</b>, together with <b>Contribution</b> <b>₹1.76L</b>, <b>20.9% margin</b>. Then <b>Orders at risk</b> <b>7</b>, <b>3 require action</b>, together with <b>Stock health</b> <b>92%</b>, <b>18 low-stock SKUs</b>.'},
   ask('share', 'Contribution is ₹1.76L on net sales of ₹8.42L. What share of sales did the shop keep?', ['20.9%', '7.8%', '79.1%'], 0,
     '₹1.76L ÷ ₹8.42L = 20.9%, the margin shown on the card. The 7.8% is how far sales are above plan, not margin.'),
   ask('leak', 'Look at My priority work. Which item says part of the sales growth may have come from discounts?', ['Margin exception: Discount leakage above plan', 'Network stock: 18 products need intervention', 'Promise risk: 3 express orders may miss SLA'], 0,
     'Discount leakage reduces what the shop keeps from each sale, even while sales grow.'),
  ]},
 {title: 'Separate material exceptions from routine work', screen: 'signals', decisions: ['D6'],
  situation: 'The Signals screen lists three exceptions: Sunflower Oil 1L may run out in 1.4 days, 12 units of Aavin Milk 500ml are close to expiry, and Ponni Rice 5kg is selling 32% above plan.',
  why: 'If you act on every signal yourself, you do your managers’ work and they stop owning it. If you act on none, a wrong plan keeps producing shortages month after month.',
  handoff: 'Routine signals stay with their owners. For a material one, you ask the store manager, Raj, for the sales trend and evidence before deciding.',
  risk: 'Treating a planning problem as a one-time reorder fixes today’s shortage and hides why it will happen again.',
  note: 'Correctly for your role, the action buttons in the Recommended action column are hidden from you, and you cannot open Signal rules. The alert rules (stock cover below 2 days, expiry within 7 days, demand 25% above plan) are set by the retail administrator.',
  steps: [
   ready('owner', 'signals'),
   {id: 'read', kind: 'read', target: () => q('#signals table'),
    text: 'Read the three signals and their priority: Sunflower Oil <b>High</b>, Aavin Milk <b>High</b>, Ponni Rice <b>Medium</b>. The column of actions is empty for you on purpose: these actions belong to the inventory and pricing teams.'},
   ask('oil', 'Sunflower Oil may run out in 1.4 days. Who raises the reorder?', ['The inventory manager', 'You, the owner', 'The cashier'], 0,
     'A stock-out signal with a known fix is routine work. The inventory manager owns it; the owner checks that it has an owner.'),
   ask('rice', 'Ponni Rice is selling 32% above plan, beyond the 25% alert rule. What do you do first?', ['Ask Raj for the sales trend and evidence before deciding', 'Raise a large reorder yourself', 'Dismiss it because it is only Medium priority'], 0,
     'A demand jump this large may mean the plan itself is wrong. Ask for evidence before changing the plan or buying more.'),
  ]},
 {title: 'Approve within policy', screen: 'approvals', decisions: ['D7'],
  situation: 'Kavya, the cashier, asked for a 12% discount worth ₹186: request APR-1042 in the table. For this lesson a copy of it is waiting in Operational approvals, where decisions are recorded. No reason was given.',
  why: 'Each above-limit discount looks small on its own. The Command center warning about discount leakage is the total of many decisions like this one.',
  handoff: 'Your decision goes back to Kavya and is recorded in the audit trail. Only an approved request changes the bill.',
  risk: 'Approving without a recorded reason teaches staff that the 10% limit is only a suggestion, and discount leakage keeps growing.',
  note: 'Decide in the Operational approvals panel; its buttons record the decision. The Review → link on the APR-1042 row opens an older window that records nothing, and the row keeps showing Pending after you decide. The audit entry always says “independent supervisor”, whoever decides.',
  setup: () => { try { if (!functionalState.approvals.some(a => a.id === SEED_ID)) { functionalState.approvals.unshift({id: SEED_ID, type: 'Discount', amount: 186, reason: '', status: 'Pending', requester: 'Kavya'}); screens(); } } catch (e) {} },
  steps: [
   ready('owner', 'approvals'),
   ask('limit', '₹186 is 12% of a ₹1,550 bill. What is the cashier’s 10% limit on that bill?', ['₹155', '₹186', '₹18.60'], 0,
     '10% of ₹1,550 is ₹155, so this request is ₹31 above the cashier’s limit.'),
   {id: 'deny', kind: 'action', guard2: {sel: '#approvals [data-a="approve"]', check: () => 'Do not use Review → on the table row. That older window does not record a decision. Use the panel this step names.'}, text: 'In <b>Operational approvals</b>, find <b>Discount · ₹186.00</b> requested by <b>Kavya</b>. Nothing follows her name: no reason was given. Without a business reason, the correct decision is <b>Deny</b>, so that Kavya resubmits with a reason. Do not use <b>Review →</b> on the table row.',
    target: () => q(`[data-approvaldecision="Denied"][data-approvalid="${SEED_ID}"]`),
    check: () => { const a = P.approvals().find(x => x.id === SEED_ID); if (!a) return 'The ₹186 request is not on the screen. Restart this lesson.'; if (a.status === 'Approved') return 'You approved a request that has no reason. Choose “Reset the request” below and decide again.'; return a.status === 'Denied' || 'The request is still pending.'; },
    fix: {label: 'Reset the request', run: () => { const a = P.approvals().find(x => x.id === SEED_ID); if (a) { a.status = 'Pending'; try { disc = 0; screens(); draw(); } catch (e) {} } }}},
  ]},
 {title: 'Review financial evidence', screen: 'delivery', decisions: ['D9'],
  situation: 'Arun, a RapidGo rider, has collected ₹4,280 cash on delivery from customers. His rider statement shows he is owed ₹680: ₹560 in delivery fees and ₹120 incentive.',
  why: 'If only the net cash is recorded, sales look ₹680 lower than they were and the delivery cost disappears from contribution: the business looks worse on sales and better on cost than it is.',
  handoff: 'Finance records the amounts and returns the matched result to you. If a figure does not match, Finance names an owner for the difference.',
  risk: 'Checking only the net cash hides two errors that cancel out, such as lower sales and a missing cost.',
  note: 'As owner you can see the rider statement but not the Finance screen, so you cannot see the deposit itself here. Do not choose “Send to Finance”; that is the logistics supervisor’s action.',
  steps: [
   ready('owner', 'delivery'),
   {id: 'cod', kind: 'read', target: () => [...document.querySelectorAll('#delivery *')].find(e => e.children.length === 0 && /COD ₹4,280/.test(e.textContent)) || null,
    text: 'Find <b>COD ₹4,280</b> next to <b>Riders & collections</b>. This is the cash customers paid the rider.'},
   {id: 'stmt', kind: 'action', text: 'Choose <b>Rider statement</b>. It shows <b>₹560.00 fees + ₹120.00 incentive · ₹680.00 payable</b>.',
    target: () => q('#delivery [data-module="riderStatement"]'),
    check: () => isM('Rider statement') || mem.answers['owner-3-stmt-seen'] || 'Open the Rider statement.',
    onPass: () => { mem.answers['owner-3-stmt-seen'] = true; }},
   ask('net', 'How much cash should Arun hand over?', ['₹3,600', '₹4,280', '₹680'], 0,
     '₹4,280 collected − ₹680 owed to him = ₹3,600.'),
   ask('books', 'The cash total is right. What must Finance still record?', ['₹4,280 received from customers and ₹680 delivery cost, separately', 'Only the ₹3,600 deposited', 'Only the ₹4,280 collected'], 0,
     'Recording both gross amounts keeps sales and delivery cost correct; the ₹3,600 is only the cash movement.'),
  ]},
 {title: 'Close the governance review', screen: 'audit', decisions: ['D10'],
  situation: 'You have reviewed business health, the signals, the discount request and the financial evidence. Now check your decision is on record and write down what you decided.',
  why: 'A decision without an owner and a review date is only an opinion. At the next review nobody can say whether it worked.',
  handoff: 'Raj, the store manager, receives the decision and the action.',
  risk: 'If decisions are not recorded, the same problem returns next month and is discussed again as if for the first time.',
  note: 'The Audit screen can search and export events, but there is no screen where the owner records a decision.',
  steps: [
   ready('owner', 'audit'),
   {id: 'find', kind: 'action', text: 'Type <b>Denied</b> in <b>Search audit</b>. Your decision from lesson 3 appears as a row with <b>Approvals</b>, <b>Denied</b> and <b>Discount · ₹186.00 · independent supervisor</b>.',
    target: () => q('#auditSearch'),
    check: () => { if (!P.audit().some(a => a.action === 'Denied' && /186/.test(a.detail))) return 'Your Deny decision from lesson 3 is not in the audit trail. Complete lesson 3 first.'; return /denied|186/i.test(q('#auditSearch')?.value || '') || 'Type Denied in Search audit.'; }},
   ask('parts', 'Which four parts make a decision complete?', ['What was decided, who owns the next action, the review date, and the evidence', 'The amount, the cashier, the time and the store', 'Sales, contribution, stock health and orders at risk'], 0,
     'For example: the cashier discount limit stays at 10%; Raj owns reducing discount leakage; a review date; and the evidence, which is the denied ₹186 request and this week’s discount events.'),
  ]},
 {title: 'Spot patterns in approval history', screen: 'approvals', decisions: ['D15'],
  situation: 'Discount leakage is above plan. Before your weekly meeting with Raj, you look at recent approval requests for patterns.',
  why: 'One exception is a decision. The same name or the same type of request appearing again and again is a pattern, and patterns are what an owner manages.',
  handoff: 'You take the pattern to Raj, the store manager, who reviews it with the people involved.',
  risk: 'Judging a person from one request is unfair; ignoring a repeated pattern lets a habit grow into a loss.',
  note: 'The history does not say whether its Owner column shows the person who asked or the person who decided. Decisions made on this screen today do not appear in this history.',
  steps: [
   ready('owner', 'approvals'),
   {id: 'pending', kind: 'read', target: () => q('#approvals table'),
    text: 'Read the pending requests and who asked: <b>APR-1042</b>, <b>Discount 12%</b>, requested by <b>Kavya</b>, <b>₹186</b>; <b>APR-1041</b>, <b>Void sale</b>, requested by <b>Arun</b>, <b>₹742</b>. Remember these two names; the history window will cover this table.'},
   {id: 'hist', kind: 'action', text: 'Choose <b>Approval history</b> and read the four past requests.', target: () => q('#approvals [data-a="history"]'),
    check: () => isM('Approval history') || 'Choose Approval history.'},
   ask('name', 'In the history window, whose name is in the Owner column on two rows?', ['Kavya', 'Arun', 'Meena'], 0, 'Kavya is on APR-1035 (Customer return) and APR-1021 (Void sale). Arun and Meena are on one row each. Kavya also asked for the pending APR-1042.'),
   ask('act', 'Kavya’s name is on two exceptions in the history and on a pending discount. What do you do?', ['Ask Raj to review these exceptions with Kavya, with the evidence', 'Remove Kavya’s access straight away', 'Nothing; it is normal'], 0, 'A repeated name is a reason to ask questions with evidence, not a verdict. Raj can also confirm whether Owner means the person who asked or who decided.'),
  ]},
 {title: 'Follow stock between stores', screen: 'stock', decisions: [],
  situation: 'Twelve units of Sunflower Oil 1L are moving from Ulundurpet Main Store to Kallakurichi Store on transfer TRF-4102.',
  why: 'When stock moves between stores, each store’s figure must change exactly once: the sending store when goods leave, the receiving store only when they arrive. Otherwise the same 12 units are counted twice, or not at all.',
  handoff: 'Store managers dispatch and receive; you check that the movement balanced.',
  risk: 'If the receiving store adds stock before the goods arrive, it can promise customers oil that is still on the road.',
  note: 'This proof shows Ulundurpet with 24 units of Sunflower Oil before the transfer, while the Sell screen shows 9 units at Ulundurpet.',
  steps: [
   ready('owner', 'stock'),
   {id: 'open', kind: 'action', text: 'Choose <b>3-store ledger</b>.', target: () => q('#stock [data-store-ledger]'),
    check: () => isM('Multi-store inventory proof') || 'Choose 3-store ledger.'},
   {id: 'read', kind: 'read', target: () => q('#overlay.show #modalBody table'),
    text: 'Read each row. <b>Ulundurpet Main</b>: 24, minus 12 dispatched, leaves 12. <b>Kallakurichi Store</b>: 7, plus 12 on receipt, makes 19. <b>Villupuram DC</b>: 86, no change; a store role cannot change it.'},
   ask('when', 'When does Kallakurichi’s stock go up by 12?', ['Only after the goods are received there', 'When the transfer is approved', 'When Ulundurpet dispatches them'], 0, 'Destination stock changes only after receipt, so oil on the road is never promised to a customer.'),
   ask('after', 'Ulundurpet had 24 and sent 12; Kallakurichi had 7. What do they hold after receipt?', ['12 and 19', '24 and 19', '12 and 7'], 0, '24 − 12 = 12 and 7 + 12 = 19. The 12 units are counted once, in one place at a time.'),
  ]},
 {title: 'Export audit evidence', screen: 'audit', decisions: [],
  situation: 'Your accountant asks for evidence of today’s decisions and cash events.',
  why: 'An export is a copy of the record at one moment. It lets someone outside the system check decisions without being given access to change anything.',
  handoff: 'The accountant receives a CSV file with the time, area, action, detail and actor of each event.',
  risk: 'Screenshots or retyped summaries lose detail and cannot be checked against the system.',
  note: 'The export contains the events recorded in this browser. New events name the person and role; events recorded before named users show “Not recorded”.',
  steps: [
   ready('owner', 'audit'),
   {id: 'export', kind: 'action', text: 'Choose <b>Export CSV</b>. Your browser downloads a file named AIFirstMart-audit.csv.', target: () => q('#audit [data-fn="auditExport"]'),
    click: '#audit [data-fn="auditExport"]', check: () => clicked('export') || 'Choose Export CSV.'},
   ask('cols', 'Which columns does the export contain?', ['Time, area, action, detail and actor', 'Only the amounts', 'A picture of each screen'], 0, 'Each row is one recorded event, with the same five fields you see in the Audit screen.'),
   ask('actor', 'Some older rows show the actor as “Not recorded”. What do you tell the accountant?', ['That those events were recorded before named users, so their names must be confirmed separately', 'That you did everything yourself', 'Nothing; it is normal'], 0, 'Evidence is only as good as what it records. Say clearly what it does not show.'),
  ]},
 {title: 'Review channel health', screen: 'channels', decisions: [],
  situation: 'Flipkart is connected in sandbox. Today’s report shows stock-error cancellations of 3.2%, above the 1% alert level.',
  why: 'Flipkart has no order-acceptance step: every order on listed stock must be fulfilled. Cancellations caused by stock errors damage the store’s rating and can lead to penalties.',
  handoff: 'The Retail administrator fixes the cause and resumes the channel after checking it.',
  risk: 'Leaving a misbehaving channel running keeps cancelling customers’ orders.',
  note: 'Suspending stops new orders and sets the channel’s stock to 0; orders already placed are still completed. Leave resuming to the Retail administrator, after the cause is fixed and checked.',
  setup: () => { try { AFMChannels.seed(S => { S.conn.flipkart = {mode: 'Sandbox', status: 'Sandbox', stores: 'All stores', buffer: 0, masked: '•••• 2038', published: items.length, stock: Object.fromEntries(items.map(it => [it.id, it.s])), syncedAt: '09:00', health: {cancellations: '3.2%', alert: true}}; }); } catch (e) {} },
  steps: [
   ready('owner', 'channels'),
   {id: 'read', kind: 'read', target: () => q('[data-ch-health="flipkart"]'),
    text: 'On the <b>Flipkart</b> card, read the health line: <b>3.2%</b> stock-error cancellations, against an alert level of 1%. Note the <b>Safety buffer: 0</b>.'},
   ask('cause', 'What is the most likely cause?', ['No safety buffer on a channel that must fulfil every order', 'Too many products published', 'Customers changing their minds'], 0, 'With a buffer of 0, Flipkart shows every unit on hand, including ones already sold at the counter but not yet synced.'),
   {id: 'suspend', kind: 'action', text: 'Choose <b>Suspend</b> on Flipkart, keep <b>Reason: Stock errors</b>, add a short note, and choose <b>Suspend channel</b>.',
    target: () => isM('Suspend Flipkart') ? (!fval('#chNote') ? field('#chNote') : field('#chSuspendSave')) : q('[data-ch-act="suspend"][data-ch="flipkart"]'),
    guard: {sel: '#chSuspendSave', check: () => fval('#chReason') !== 'Stock errors' ? 'The reason is Stock errors.' : !fval('#chNote') ? 'Add a short note for the administrator.' : null},
    check: () => (CHS().conn.flipkart?.status === 'Suspended') || 'Flipkart is not suspended yet.'},
   ask('placed', 'What happens to Flipkart orders already placed?', ['They are still completed', 'They are cancelled', 'They move to WhatsApp'], 0, 'Freeze new, finish existing: customers are not punished for the channel’s fault.'),
  ]}
]},
admin: {title: 'Retail administrator', lessons: [
 {title: 'Check the store and terminal record', screen: 'setup', decisions: ['D12'],
  situation: 'Before the store’s first sale, every receipt must carry the right store name, GSTIN and terminal. You check the store and terminal record for POS-01.',
  why: 'Every receipt and report takes these details from this one record. A wrong GSTIN prints on every tax invoice, and a wrong receipt width can cut off the total.',
  handoff: 'Cashiers receive the settings on their next sale. The store manager relies on the terminal ID to reconcile POS-01’s cash.',
  risk: 'Changing a store record casually changes every receipt and report that uses it.',
  note: 'Saving shows “Store and terminal settings saved” but writes no audit entry.',
  steps: [
   ready('admin', 'setup'),
   {id: 'open', kind: 'action', text: 'Choose <b>Configure</b> on <b>Store & terminal</b>.',
    target: () => q('#setup [data-a="store"]'), check: () => isM('Store and terminal') || 'Choose Configure on Store & terminal.'},
   {id: 'read', kind: 'read', target: () => q('#overlay.show #modalBody'),
    text: 'Check each field: <b>Ulundurpet Main Store</b>; GSTIN <b>33AAECA1234A1Z5</b>, the same number printed on every receipt; terminal <b>POS-01</b>; receipt width <b>80 mm</b>; address <b>Trichy Main Road, Ulundurpet, Tamil Nadu</b>; default language <b>English</b>.'},
   ask('width', 'The receipt printer for POS-01 uses 80 mm paper. Which receipt width must this record use?', ['80 mm', '58 mm', 'Either; the printer adjusts'], 0,
     'The record and the printer must match. A 58 mm layout on 80 mm paper, or the reverse, prints receipts that are cut off or misaligned.'),
   {id: 'save', kind: 'action', text: 'Choose <b>Save</b> without changing anything.',
    target: () => isM('Store and terminal') ? field('#saveStore') : q('#setup [data-a="store"]'),
    guard: {sel: '#saveStore', check: () => { const v = modalInputs().map(mtext); return v[0] !== 'Ulundurpet Main Store' ? 'The store name was changed. Set it back to Ulundurpet Main Store.' : v[1] !== '33AAECA1234A1Z5' ? 'The GSTIN was changed. Set it back to 33AAECA1234A1Z5.' : v[2] !== 'POS-01' ? 'The terminal ID was changed. Set it back to POS-01.' : v[3] !== '80 mm' ? 'Set Receipt width to 80 mm to match the printer.' : null; }},
    check: () => committed('#saveStore') || 'Not saved yet.'},
  ]},
 {title: 'Invite a user with the right access', screen: 'setup', decisions: ['D11'],
  situation: 'Divya joins Ulundurpet Main Store as a cashier on Monday. She needs to sell at the counter, nothing more.',
  why: 'Access should match the job. A cashier with administrator rights, or with access to all stores, can change prices, users or stock she was never meant to touch.',
  handoff: 'Divya receives an invitation. Her store manager confirms she has started before the account is used.',
  risk: 'Giving extra access because it is convenient is how mistakes, and fraud, become possible.',
  note: 'People invited here also appear in Access policy, where their roles, stores and limits are managed. The users list and the approvals screen now both show Raj as Store manager.',
  steps: [
   ready('admin', 'setup'),
   {id: 'open', kind: 'action', text: 'Choose <b>Configure</b> on <b>Users & roles</b>.',
    target: () => q('#setup [data-a="users"]'), check: () => isM('Users and roles') || 'Choose Configure on Users & roles.'},
   ask('scope', 'Divya asks for All stores access “just in case”. What do you do?', ['Keep her scope to Ulundurpet Main Store', 'Give All stores; it saves time later', 'Make her a Retailer Administrator'], 0,
     'Access follows the job she does today. If she moves stores, her access changes then.'),
   {id: 'invite', kind: 'action',
    text: 'In <b>Add named user</b>, type <b>Divya</b>. Set <b>Role: Cashier</b> and <b>Partner / store scope: Ulundurpet Main Store</b>. Choose <b>Invite user</b>.',
    target: () => isM('Users and roles') ? (!/^(divya|திவ்யா)$/i.test(fval('#userName')) ? field('#userName') : fval('#userRole') !== 'Cashier' ? field('#userRole') : fval('#userScope') !== 'Ulundurpet Main Store' ? field('#userScope') : field('#addUserComplete')) : q('#setup [data-a="users"]'),
    guard: {sel: '#addUserComplete', check: () => !/^(divya|திவ்யா)$/i.test(fval('#userName')) ? 'Type Divya as the user name.' : fval('#userRole') !== 'Cashier' ? 'Set Role to Cashier; that is her job.' : fval('#userScope') !== 'Ulundurpet Main Store' ? 'Set the scope to Ulundurpet Main Store only.' : null},
    check: () => newAudit(/User invited.*(Divya|திவ்யா)/i) || 'The invitation is not recorded yet.'},
  ]},
 {title: 'Set up payments and the cash drawer', screen: 'setup', decisions: [],
  situation: 'The cashier course teaches that POS-01 opens with ₹2,500 in the drawer and accepts cash, UPI, card and split payments. Those rules come from settings you own.',
  why: 'If the drawer setting and what cashiers are taught disagree, every shift starts with a cash difference nobody can explain.',
  handoff: 'Cashiers and the store manager work from these settings at the start of every shift.',
  risk: 'Turning off a payment method, or changing the opening amount without telling the store, causes failed payments and unexplained cash differences.',
  note: 'Saving these settings writes no audit entry.',
  steps: [
   ready('admin', 'setup'),
   {id: 'pay', kind: 'action',
    text: 'Choose <b>Configure</b> on <b>Payments</b>. Check that <b>Cash</b>, <b>UPI</b> (Dynamic QR · Razorpay terminal), <b>Credit / debit card</b> (Pinelabs POS · Terminal PL-2038) and <b>Split tender</b> are all ticked, and the timeout is <b>90 seconds</b>. Then choose <b>Cancel</b> to leave them unchanged.',
    target: () => isM('Payment configuration') ? field('#modalFoot [data-a="cancel"]') : q('#setup [data-a="payments"]'),
    check: seen('admin-2-pay', 'Payment configuration', 'Check the four methods and the timeout, then choose Cancel.', 'Choose Configure on Payments.')},
   {id: 'drawer', kind: 'action',
    text: 'Choose <b>Configure</b> on <b>Cash drawer</b>. Check <b>Opening float: 2500</b> and <b>Open drawer: After every cash payment</b>. Choose <b>Save</b>.',
    target: () => isM('Cash drawer setup') ? field('#saveDrawer') : q('#setup [data-a="drawer"]'),
    guard: {sel: '#saveDrawer', check: () => { const v = modalInputs().map(mtext); return v[1] !== '2500' ? 'Set Opening float back to 2500; that is what cashiers are taught to count.' : v[0] !== 'After every cash payment' ? 'Set Open drawer to After every cash payment.' : null; }},
    check: () => committed('#saveDrawer') || 'Not saved yet.'},
   ask('tell', 'If you ever change the opening float to ₹3,000, who must know before the next shift?', ['The store manager and the cashiers', 'Nobody; the drawer adjusts itself', 'Only Finance, at month end'], 0,
     'Cashiers count the opening amount and the store manager reconciles against it. Both need the new figure before the shift starts.'),
  ]},
 {title: 'Test devices and know their status', screen: 'setup', decisions: [],
  situation: 'The store asks whether POS-01’s barcode scanner is ready for live sales.',
  why: 'A device that passes a test is not the same as a device certified for live trading. Certification checks the real device, driver, firmware and network.',
  handoff: 'Your test result and the certification state go to the store manager, who decides whether the counter can open.',
  risk: 'Calling a demo device “ready” means the first real failure happens with a customer waiting.',
  note: 'Device tests show a confirmation message but write no audit entry.',
  steps: [
   ready('admin', 'setup'),
   {id: 'scan', kind: 'action',
    text: 'Choose <b>Configure</b> on <b>Barcode scanner</b>. In <b>Scan a barcode now</b>, scan or type <b>8901002</b> and press Enter.',
    target: () => isM('Test scanner') ? field('#test') : q('#setup [data-a="testScan"]'),
    check: () => toastSince(/8901002/) || 'The scanner test has not passed yet.'},
   {id: 'matrix', kind: 'action', text: 'Close the test and choose <b>Open assurance matrix</b>.',
    target: () => isM('Test scanner') ? field('#modalFoot [data-a="cancel"]') : q('#setup [data-hardware-test]'),
    check: () => isM('Hardware assurance & certification') || 'Choose Open assurance matrix.'},
   ask('cert', 'The matrix says no hardware is production-certified, and the scanner shows “Physical certification pending”. What do you tell the store?', ['The scanner passed a demo test; physical certification is still pending', 'The scanner is certified for live sales', 'Devices never need certification'], 0,
     'A passed test proves the screen handles the device. Certification needs the named device, its serial, firmware, operating system and store network.'),
  ]},
 {title: 'Set the signal rules', screen: 'signals', decisions: ['D12'],
  situation: 'The owner and the store manager read the Signals screen every morning. The rules that decide what appears there are yours.',
  why: 'A rule set too loose hides real problems; too tight, and managers are flooded with warnings until they ignore them. Ponni Rice appears today because demand is 32% above plan and the rule alerts above 25%.',
  handoff: 'The owner, the store manager and the inventory team see signals produced by these rules.',
  risk: 'Switching off a rule quietly removes a warning everyone else relies on.',
  note: 'Saving rules writes no audit entry, and there is no approval step or version history for configuration changes.',
  steps: [
   ready('admin', 'signals'),
   {id: 'open', kind: 'action', text: 'Choose <b>Signal rules</b>.',
    target: () => q('#signals [data-a="rules"]'), check: () => isM('Signal rules') || 'Choose Signal rules.'},
   {id: 'read', kind: 'read', target: () => q('#overlay.show #modalBody'),
    text: 'Read the four rules: <b>Stock-out risk</b> when cover falls below 2 days; <b>Expiry risk</b> 7 days before expiry; <b>Demand surge</b> when demand exceeds plan by 25%; <b>Inventory variance</b> when shelf and system stock differ.'},
   ask('which', 'Sunflower Oil shows “Stock-out risk in 1.4 days”. Which rule raised it?', ['Stock-out risk: cover below 2 days', 'Demand surge: above plan by 25%', 'Expiry risk: 7 days before expiry'], 0,
     '1.4 days of cover is below the 2-day threshold, so the stock-out rule fires.'),
   {id: 'save', kind: 'action', text: 'Keep all four rules switched on and choose <b>Save</b>.',
    target: () => isM('Signal rules') ? field('#saveRules') : q('#signals [data-a="rules"]'),
    guard: {sel: '#saveRules', check: () => [...document.querySelectorAll('#overlay.show #modalBody input[type=checkbox]')].every(x => x.checked) ? null : 'A rule is switched off. Keep all four on; each one feeds the Signals screen.'},
    check: () => committed('#saveRules') || 'Not saved yet.'},
  ]},
 {title: 'Add a new product correctly', screen: 'catalogue', decisions: [],
  situation: 'The cashier reported barcode 8901099 as unknown. The supplier’s invoice lists it as Aavin Curd 400g, selling price ₹35.00, category Dairy.',
  why: 'A product record is shared by every counter and channel. One record per barcode keeps price, tax and stock right everywhere.',
  handoff: 'Once created, cashiers can sell the product. Stock arrives only when the store receives it.',
  risk: 'Reusing a barcode that already belongs to another product gives two products the same identity, and every scan sells the wrong one.',
  note: 'The Add product window refuses a barcode that already belongs to another product. Check the catalogue list first anyway. In this practice system, codes such as 8901002 are the shop’s own item codes printed on shelf labels and scanned at the till. Real packs carry 13-digit GTIN barcodes; the platform will hold those in a separate field. Enter the shop’s item code in the Barcode field.',
  setup: () => { try { for (let i = items.length - 1; i >= 0; i--) if (items[i].id === '8901099') items.splice(i, 1); screens(); } catch (e) {} },
  steps: [
   ready('catalogue', 'catalogue'),
   {id: 'check', kind: 'read', target: () => q('#catalogue table'),
    text: 'Check the catalogue list first. Barcodes <b>8901001</b> to <b>8901008</b> are already in use. <b>8901099</b> is not.'},
   ask('dup', 'Suppose the invoice had shown barcode 8901002 for the curd. What would you do?', ['Stop and check with the supplier; 8901002 is Aavin Milk', 'Create the curd anyway', 'Change Aavin Milk’s barcode'], 0, 'A barcode identifies exactly one product. A clash is a supplier or invoice error to resolve first.'),
   {id: 'create', kind: 'action', text: 'Choose <b>＋ Add product</b>. Enter <b>Barcode: 8901099</b>, <b>Product name: Aavin Curd 400g</b>, <b>Sell price: 35</b>, <b>Opening stock: 0</b>, <b>Category: Dairy</b>. Choose <b>Create product</b>.',
    target: () => isM('Add catalogue product') ? (fval('#pcBar') !== '8901099' ? field('#pcBar') : !/^(aavin curd 400g|ஆவின் தயிர் 400 ?கி\.?)$/i.test(fval('#pcName')) ? field('#pcName') : fval('#pcPrice') !== '35' ? field('#pcPrice') : fval('#pcStock') !== '0' ? field('#pcStock') : mtext(modalInputs().slice(-1)[0]) !== 'Dairy' ? modalInputs().slice(-1)[0] : field('#createProduct')) : q('#catalogue [data-a="addProduct"]'),
    guard: {sel: '#createProduct', check: () => fval('#pcBar') !== '8901099' ? 'The barcode is 8901099.' : item('8901099') ? '8901099 is already in the catalogue. Do not create it twice.' : !/^(aavin curd 400g|ஆவின் தயிர் 400 ?கி\.?)$/i.test(fval('#pcName')) ? 'Type the name as on the invoice: Aavin Curd 400g.' : fval('#pcPrice') !== '35' ? 'The selling price is 35.' : fval('#pcStock') !== '0' ? 'Keep Opening stock at 0; stock is added when goods are received.' : mtext(modalInputs().slice(-1)[0]) !== 'Dairy' ? 'Set Category to Dairy.' : null},
    check: () => { const x = item('8901099'); return (x && /curd|தயிர்/i.test(x.n)) || 'The product is not created yet.'; }},
   ask('zero', 'Why is the opening stock 0?', ['Stock is added only when the store receives the goods', 'The product is free', 'The system fills it in automatically'], 0, 'Creating a product record does not prove that any goods have arrived.'),
  ]},
 {title: 'Remove access when someone leaves', screen: 'setup', decisions: [],
  situation: 'Suresh, a cashier at Ulundurpet, finished his last shift today and has left the company.',
  why: 'An account belongs to a job, not to a person forever. A leaver’s active account is a door anyone who knows the password can use.',
  handoff: 'The disabled account can no longer be used, and the store manager confirms the change.',
  risk: 'An account left active after someone leaves can be used to sell, refund or approve under their name.',
  note: 'Disabling is recorded in the audit trail. Suresh is added to this practice user list for the lesson.',
  setup: () => { try { const u = functionalState.users.find(x => x.name === 'Suresh'); if (u) u.status = 'Active'; else functionalState.users.push({name: 'Suresh', role: 'Cashier', status: 'Active'}); persistFunctional(); } catch (e) {} },
  steps: [
   ready('admin', 'setup'),
   {id: 'open', kind: 'action', text: 'Choose <b>Configure</b> on <b>Users & roles</b>.', target: () => q('#setup [data-a="users"]'),
    check: () => isM('Users and roles') || 'Choose Configure on Users & roles.'},
   {id: 'disable', kind: 'action', text: 'Find <b>Suresh</b>, shown as <b>Cashier · Active</b>, and choose <b>Disable</b> on his row.',
    target: () => { try { return q(`#overlay.show [data-usertoggle="${functionalState.users.findIndex(x => x.name === 'Suresh')}"]`) || q('#setup [data-a="users"]'); } catch (e) { return null; } },
    guard: {sel: '[data-usertoggle]', check: el => { try { const u = functionalState.users[+el.dataset.usertoggle]; return u && u.name !== 'Suresh' ? `${u.name} has not left. Disable only Suresh.` : null; } catch (e) { return null; } }},
    check: () => newAudit(/User status changed.*Suresh · Disabled/) || 'Suresh is not disabled yet.'},
   ask('when', 'When should a leaver’s access be removed?', ['On their last working day, before they leave', 'At the next quarterly review', 'Only if someone reports a problem'], 0, 'Access should end when the job ends.'),
  ]},
 {title: 'Trace a failed integration event', screen: 'observability', decisions: [],
  situation: 'The Observability screen shows a problem from this afternoon: an inventory event failed and was moved to a dead-letter queue, a holding area for messages the system could not process.',
  why: 'When a message between systems fails, stock or orders can quietly fall out of step. Finding the failed event, and confirming it was replayed exactly once, keeps every store’s figures right.',
  handoff: 'The on-call engineer replays the event; you confirm the outcome and tell the stock owner.',
  risk: 'Replaying a failed stock event twice adds the same goods twice.',
  note: 'This screen shows simulated test values, not live health. The Partner webhook card shows DLQ 1, while the failed event in the table belongs to Inventory.',
  steps: [
   ready('admin', 'observability'),
   ask('which', 'Read the table. Which event failed and was moved to the dead-letter queue?', ['COR-STK-4102: Inventory transfer receipt', 'COR-ORD-8821: Reserve inventory', 'COR-PAY-8821: Capture prepaid'], 0, 'COR-STK-4102 shows FAILED, 3 retries, DLQ-009. The others returned 200.'),
   {id: 'timeline', kind: 'read', target: () => [...document.querySelectorAll('#observability *')].find(e => e.children.length === 0 && /Incident timeline/.test(e.textContent)) || null,
    text: 'Read the incident timeline: failed at <b>14:02:11</b>; three retries; moved to <b>DLQ-009</b> at 14:03:43 and on-call notified; replayed at <b>14:08:10</b> after a store-scope correction; completed at 14:08:11, <b>destination stock updated once</b>.'},
   ask('once', 'Why does “destination stock updated once” matter?', ['A second replay would add the same 12 units again', 'It means the replay was slow', 'It does not matter'], 0, 'Each stock movement must be applied exactly once.'),
   {id: 'trace', kind: 'action', text: 'Choose <b>Trace</b> on <b>COR-STK-4102</b> to open its trace.', target: () => q('[data-trace="COR-STK-4102"]'),
    check: () => isM('Trace COR-STK-4102') || 'Choose Trace on COR-STK-4102.'},
  ]},
 {title: 'Connect a sales channel', screen: 'channels', decisions: [],
  situation: 'AIFirstMart Retail wants customers to order on WhatsApp. Your job is to connect the business’s own WhatsApp account to the platform, starting in sandbox.',
  why: 'A channel connected carelessly can promise stock the store does not have, or expose the business’s credentials. Sandbox proves the connection works before any real customer sees it.',
  handoff: 'Once WhatsApp is connected and its stock is synced, the store manager can watch channel stock, and orders arrive in Channel orders.',
  risk: 'Connecting straight to live, or with no safety buffer, means the first stock mismatch reaches a real customer.',
  note: 'In sandbox the administrator may test-publish the catalogue and test-sync stock; once live, publishing belongs to the Catalogue manager and stock sync to store and inventory roles. In this practice any test values are accepted as credentials, and stock is published when you choose Sync stock.',
  setup: () => { try { AFMChannels.seed(S => { delete S.conn.whatsapp; S.reserved = {}; S.orders = S.orders.filter(o => o.ch !== 'whatsapp'); }); } catch (e) {} },
  steps: [
   ready('admin', 'channels'),
   {id: 'connect', kind: 'action',
    text: 'On WhatsApp, choose <b>Connect</b>. Keep <b>Mode: Sandbox</b>. Fill all four credential fields with the test values from your Meta app; in this practice any text is accepted. Keep <b>Stores: Ulundurpet Main Store</b>, set <b>Safety buffer: 2</b>, and choose <b>Connect</b>.',
    target: () => { if (!isM('Connect WhatsApp')) return q('[data-ch-act="connect"][data-ch="whatsapp"]'); const empty = [...document.querySelectorAll('#overlay.show [data-cred]')].find(i => !i.value.trim()); return empty || (fval('#chBuffer') !== '2' ? field('#chBuffer') : field('#chConnectSave')); },
    guard: {sel: '#chConnectSave', check: () => fval('#chMode') !== 'Sandbox' ? 'Keep Mode as Sandbox. Live needs certification and approval first.' : [...document.querySelectorAll('#overlay.show [data-cred]')].some(i => !i.value.trim()) ? 'Fill every credential field.' : fval('#chStores') !== 'Ulundurpet Main Store' ? 'Keep Stores as Ulundurpet Main Store.' : fval('#chBuffer') !== '2' ? 'Set Safety buffer to 2.' : null},
    check: () => { const c = CHS().conn.whatsapp; return (c && c.status === 'Sandbox' && c.buffer === 2) || 'WhatsApp is not connected in sandbox yet.'; }},
   ask('why', 'Why does a new channel start in sandbox?', ['So the connection is proven before any real customer sees it', 'Because sandbox is faster', 'Because live channels cannot take orders'], 0, 'Sandbox uses simulated customers and stock messages; nothing reaches a real customer until the connection is certified and approved.'),
   {id: 'publish', kind: 'action', text: 'Choose <b>Publish catalogue</b> on WhatsApp.', target: () => q('[data-ch-act="publish"][data-ch="whatsapp"]'),
    check: () => (CHS().conn.whatsapp?.published > 0) || 'The catalogue is not published yet.'},
   {id: 'sync', kind: 'action', text: 'Choose <b>Sync stock</b> on WhatsApp, then find <b>Aavin Milk 500ml</b> in <b>Stock published to channels</b>.', target: () => q('[data-ch-act="sync"][data-ch="whatsapp"]'),
    check: () => (CHS().conn.whatsapp?.stock?.['8901002'] === 30) || 'Stock is not synced yet.'},
   ask('qty', 'Aavin Milk has 32 on hand and a safety buffer of 2. What does WhatsApp show?', ['30', '32', '34'], 0, '32 on hand − 2 buffer − 0 reserved = 30. The buffer covers sales the channel has not heard about yet.'),
  ]},
 {title: 'Receive a channel order', screen: 'channels', decisions: [],
  situation: 'A customer on WhatsApp orders 2 packets of Aavin Milk. In sandbox you can simulate exactly that order.',
  why: 'An order from any channel must reserve stock the moment it arrives, so the same packet is never promised to two customers.',
  handoff: 'The order goes to the store for picking, and the customer receives a confirmation.',
  risk: 'If a channel keeps showing stock that is already reserved, two customers can be promised the same packet.',
  note: 'In this practice system you sync stock by hand; in the real platform the reservation is pushed to every channel automatically.',
  setup: () => { try { AFMChannels.seed(S => { S.reserved = {}; if (S.conn.whatsapp && S.conn.whatsapp.status !== 'Suspended') S.conn.whatsapp.stock = Object.fromEntries(items.map(it => [it.id, Math.max(0, it.s - S.conn.whatsapp.buffer)])); }); mem.answers['admin-9-base'] = CHS().orders.filter(o => o.ch === 'whatsapp').length; } catch (e) {} },
  steps: [
   ready('admin', 'channels', () => CHS().conn.whatsapp && CHS().conn.whatsapp.status === 'Sandbox' ? true : 'WhatsApp is not connected in sandbox. Complete lesson 9 first.'),
   {id: 'simulate', kind: 'action', text: 'Choose <b>Simulate order</b> on WhatsApp.', target: () => q('[data-ch-act="simulate"][data-ch="whatsapp"]'),
    check: () => CHS().orders.filter(o => o.ch === 'whatsapp').length > (mem.answers['admin-9-base'] || 0) || 'No new WhatsApp order yet.'},
   {id: 'read', kind: 'read', target: () => q('#chOrders'),
    text: 'In <b>Channel orders</b>, find the new order: <b>Aavin Milk 500ml × 2</b>, status <b>Received · stock reserved</b>. In <b>Stock published to channels</b>, the Reserved column for Aavin Milk now shows <b>2</b>.'},
   ask('before', 'WhatsApp still shows 30 for Aavin Milk. What must happen before it shows 28?', ['Stock is synced to the channel again', 'The customer pays', 'Nothing; 30 is correct'], 0, '32 on hand − 2 buffer − 2 reserved = 28, but the channel only learns it when stock is synced.'),
   {id: 'resync', kind: 'action', text: 'Choose <b>Sync stock</b> on WhatsApp. Aavin Milk now shows <b>28</b>.', target: () => q('[data-ch-act="sync"][data-ch="whatsapp"]'),
    check: () => (CHS().conn.whatsapp?.stock?.['8901002'] === 28) || 'WhatsApp does not show 28 yet. Choose Sync stock.'},
  ]},
 {title: 'Set up customer sign-in', screen: 'signin', decisions: [],
  situation: 'Customers want to shop on the AIFirstMart Retail mobile app with their phone number, without a password.',
  why: 'Sign-in decides who can see orders, addresses and payments. A one-time code sent to the customer’s phone proves they hold that number.',
  handoff: 'Customers sign in on the mobile app with their number; their WhatsApp and app orders appear in the same account.',
  risk: 'Codes that never expire, or unlimited attempts, let someone guess their way into a customer’s account.',
  note: 'In this practice system the code appears on screen as a sandbox SMS. In the real platform it is sent by SMS through a provider registered with TRAI’s DLT system.',
  setup: () => { try { AFMChannels.seed(S => { S.signin.otp = false; S.otp = null; S.lastLogin = null; }); } catch (e) {} },
  steps: [
   ready('admin', 'signin'),
   {id: 'enable', kind: 'action', text: 'Tick <b>Mobile number with one-time code</b> and choose <b>Save</b>.',
    target: () => q('#siOtp') && !q('#siOtp').checked ? q('#siOtp') : q('#siSave'),
    check: () => CHS().signin.otp === true || 'Mobile sign-in is not switched on and saved yet.'},
   {id: 'test', kind: 'action', text: 'In <b>Test a customer sign-in</b>, enter <b>98765 43210</b> and choose <b>Send code</b>. Type the 6-digit code from the sandbox message and choose <b>Verify</b>.',
    target: () => CHS().otp ? (!(q('#otpCode')?.value || '').trim() ? q('#otpCode') : q('#otpVerify')) : (!(q('#otpPhone')?.value || '').trim() ? q('#otpPhone') : q('#otpSend')),
    check: () => (CHS().lastLogin && CHS().lastLogin.phone === '+919876543210') || 'The test customer is not signed in yet.'},
   ask('attempts', 'Someone types a wrong code five times. What happens?', ['The code stops working; a new code must be requested', 'They can keep trying', 'The customer’s account is deleted'], 0, 'After 5 attempts the code is cancelled, which stops anyone guessing their way in.'),
  ]},
 {title: 'Correct a product record', screen: 'catalogue', decisions: [],
  situation: 'The catalogue lists Aavin Milk 500ml under Grocery. It is a dairy product, so customers browsing Dairy on the app and WhatsApp cannot find it.',
  why: 'The catalogue is shared by every till and every channel. One wrong category or price is repeated everywhere the product appears.',
  handoff: 'Saved changes reach the tills at once, and every channel at its next catalogue publish.',
  risk: 'Changing a barcode instead of creating a new product would mix two products’ sales and stock history.',
  note: 'Catalogue changes belong to the Catalogue manager, not the administrator’s privileged account, so this lesson uses the Catalogue manager view. The barcode cannot be edited here: a different barcode means a different product. Each saved change is recorded in the audit trail with the old and new values.',
  setup: () => { try { const st = AFMCatalogue.state(); delete st.edits['8901002']; const it = items.find(x => x.id === '8901002'); if (it) it.cat = 'Grocery'; AFMCatalogue.render(); } catch (e) {} },
  steps: [
   ready('catalogue', 'catalogue'),
   {id: 'edit', kind: 'action', text: 'On <b>Aavin Milk 500ml</b>, choose <b>Edit</b>. Set <b>Category: Dairy</b>, leave the name and price as they are, and choose <b>Save changes</b>.',
    target: () => isM('Edit product · Aavin Milk 500ml') ? (fval('#ceCat') !== 'Dairy' ? field('#ceCat') : field('#catEditSave')) : q('[data-cat-edit="8901002"]'),
    guard: {sel: '#catEditSave', check: () => fval('#ceCat') !== 'Dairy' ? 'Set Category to Dairy.' : fval('#ceName') !== 'Aavin Milk 500ml' || fval('#cePrice') !== '26' ? 'Change only the category; keep the name and price.' : null},
    check: () => (items.find(x => x.id === '8901002')?.cat === 'Dairy') || 'Aavin Milk is not in Dairy yet.'},
   ask('barcode', 'Why can’t you change a product’s barcode here?', ['A different barcode means a different product, with its own sales and stock history', 'Barcodes are set by the till', 'The screen is read-only'], 0, 'The barcode is the product’s identity. To sell a product under a new barcode, create a new product.'),
  ]},
 {title: 'Review a catalogue upload before committing', screen: 'catalogue', decisions: [],
  situation: 'A supplier has sent a catalogue file with five rows: new products and a price change. Files from outside often contain mistakes.',
  why: 'Committing a file changes prices and products on every till and channel at once. Reviewing first catches typing errors, duplicates and barcode clashes before they reach a customer.',
  handoff: 'Committed products appear on the tills straight away, and on channels at their next catalogue publish.',
  risk: 'Committing a row whose barcode already belongs to another product would make every scan of Aavin Milk sell the wrong product.',
  note: 'Catalogue uploads belong to the Catalogue manager, so this lesson uses that view. This practice uses a built-in sample file; you can also upload your own CSV with the columns barcode, name, category, price, stock. Updates change name, category and price only; stock changes through receiving.',
  setup: () => { try { const st = AFMCatalogue.state(); st.stage = null; const drop = ['8901010', '8901011', '8901012']; st.added = st.added.filter(a => !drop.includes(a.id)); for (let i = items.length - 1; i >= 0; i--) if (drop.includes(items[i].id)) items.splice(i, 1); delete st.edits['8901005']; const oil = items.find(x => x.id === '8901005'); if (oil) oil.p = 142; AFMCatalogue.render(); } catch (e) {} },
  steps: [
   ready('catalogue', 'catalogue'),
   {id: 'upload', kind: 'action', text: 'Choose <b>Import</b>, then <b>Use the training sample file</b>.',
    target: () => isM('Import catalogue') ? field('#catSample') : q('#catImport'),
    check: () => (CAT().stage && CAT().stage.file === 'training-sample.csv') || 'The sample file is not uploaded yet.'},
   {id: 'read', kind: 'read', target: () => q('#catStage'),
    text: 'Read the review table. Three rows are marked <b>Fix</b>: row 1 has the price <b>6O</b>, typed with a letter O instead of a zero; row 3 uses barcode <b>8901002</b>, which already belongs to Aavin Milk 500ml; row 5 is a duplicate of row 2.'},
   {id: 'price', kind: 'action', text: 'In row 1, change the price to <b>60</b> and press Tab.', target: () => q('[data-stage="price"][data-row="1"]'),
    check: () => (stageRow(1)?.price === '60') || 'Row 1 does not show the price 60 yet.'},
   {id: 'barcode', kind: 'action', text: 'In row 3, Heritage Milk needs its own barcode. Change it to <b>8901012</b> and press Tab.', target: () => q('[data-stage="barcode"][data-row="3"]'),
    check: () => (stageRow(3)?.barcode === '8901012') || 'Row 3 does not show barcode 8901012 yet.'},
   {id: 'delete', kind: 'action', text: 'Choose <b>Delete</b> on row 5, the duplicate.', target: () => q('[data-stage-del="5"]'),
    check: () => (CAT().stage && !stageRow(5)) || 'Row 5 is still in the upload.'},
   ask('why', 'Why is Commit disabled while any row shows Fix?', ['So no invalid row can reach the tills and channels', 'Because the file is too large', 'Because only the owner can commit'], 0, 'Commit becomes available only when every row is valid, so a single bad row can never slip through.'),
   {id: 'commit', kind: 'action', text: 'Every row is now valid. Choose <b>Commit 4 rows</b>.', target: () => q('#stageCommit'),
    check: () => (!CAT().stage && ['8901010', '8901011', '8901012'].every(id => items.some(x => x.id === id)) && items.find(x => x.id === '8901005')?.p === 145) || 'The upload is not committed yet.'},
  ]},
 {title: 'Set what each role may do', screen: 'policy', decisions: [],
  situation: 'The finance team asks for Finance to raise purchase orders while Procurement is on leave. Separately, the owner wants the cashiers’ discount ceiling lowered from 10% to 8%. You prepare the change; the owner approves it.',
  why: 'Every permission decides what real people can do with stock and money. A role that can both raise purchase orders and pay for them removes the check that stops fraud.',
  handoff: 'Published changes apply at once to every user with the role, and their limits are capped to the new ceiling.',
  risk: 'Publishing without reading the change summary can quietly grant or remove access across every store.',
  note: 'A policy change takes effect only after a second person, the owner, approves it: nobody approves their own change. In this practice the policy is saved in your browser only; in the real platform the server enforces it on every request.',
  setup: () => { try { AFMPolicy.reset(); AFMPolicy.state().tab = 'roles'; AFMPolicy.render(); } catch (e) {} },
  steps: [
   ready('admin', 'policy'),
   {id: 'tick', kind: 'action', text: 'In <b>Roles and permissions</b>, find the row <b>Raise purchase orders</b> and tick it in the <b>Finance and accounts</b> column. Scroll the matrix to the right to reach Finance.',
    target: () => POL().tab !== 'roles' ? q('[data-ptab="roles"]') : q('[data-perm="finance:purchase_orders:write"]'),
    check: () => (POL().draft.extras.finance || []).includes('purchase_orders:write') || 'Raise purchase orders is not ticked for Finance yet.'},
   {id: 'conflict', kind: 'read', target: () => q('#policyConflicts') || q('#policyPublish'),
    text: 'Read the red message under <b>Draft policy</b>: Finance would raise purchase orders and also reconcile or release payments. <b>Publish policy</b> is disabled.'},
   ask('why', 'Why is this combination blocked?', ['One person could raise a purchase order and also approve its payment', 'Finance is too busy', 'Purchase orders need a store'], 0, 'Separating buying from paying means two different people must agree before money leaves the business.'),
   {id: 'untick', kind: 'action', text: 'Untick <b>Raise purchase orders</b> for Finance. The red message disappears.', target: () => q('[data-perm="finance:purchase_orders:write"]'),
    check: () => (!(POL().draft.extras.finance || []).includes('purchase_orders:write') && !AFMPolicy.roleConflicts().length) || 'Finance still has Raise purchase orders.'},
   {id: 'limit', kind: 'action', text: 'In <b>Limits and scope</b> at the bottom of the matrix, set the <b>Cashier</b> discount ceiling to <b>8</b> and press Tab.', target: () => q('[data-limit="cashier:discount"]'),
    check: () => (POL().draft.limits.cashier?.discount === 8) || 'The Cashier discount ceiling is not 8 yet.'},
   {id: 'publish', kind: 'action', text: 'Choose <b>Submit for owner approval</b>, read the summary of changes, and choose <b>Submit for approval</b>.',
    target: () => isM('Submit access policy') ? field('#policyConfirm') : q('#policyPublishBtn'),
    check: () => (POL().pending && POL().pending.changes.some(c => c.startsWith('Cashier: discount ceiling'))) || POL().published.version >= 2 || 'The change is not submitted yet.'},
   {id: 'approve', kind: 'action', text: 'Now act as the second person. Switch <b>View as</b> to <b>Business owner</b>, open <b>Access policy</b>, read the request, and choose <b>Approve and publish</b>.',
    target: () => P.persona() !== 'owner' ? q('#personaSelect') : (q('#policyApprove') || q('#side [data-nav="policy"]')),
    check: () => (POL().published.version >= 2 && POL().published.limits.cashier?.discount === 8) || 'The owner has not approved the change yet.'},
   ask('kavya', 'Kavya’s own discount limit was 10%. What is it now?', ['8%, capped to the new ceiling', 'Still 10%', '0%'], 0, 'A user’s limit can never be above their role’s ceiling, so publishing capped it and recorded the change in the audit trail.'),
  ]},
 {title: 'Give people their roles', screen: 'policy', decisions: [],
  situation: 'Divya, invited earlier as a cashier, starts at Ulundurpet Main Store tomorrow. She needs the Cashier role at that store, with a lower discount limit while she is new.',
  why: 'Roles decide what each person can do; stores decide where. Giving more than the job needs is how mistakes and fraud reach the till.',
  handoff: 'Divya signs in with her email and sees only the Cashier screens, for Ulundurpet Main Store.',
  risk: 'Giving one person both Cashier and Store manager lets them approve exceptions at their own counter.',
  note: 'Each change is saved as you tick it and recorded in the audit trail. In this practice, users are saved in your browser only.',
  setup: () => { try { const st = AFMPolicy.state(); st.users = st.users.filter(u => u.id !== 'U8' && u.name !== 'Divya'); st.users.push({id: 'U8', name: 'Divya', email: 'divya@aifirstmart.example', roles: [], stores: [], limits: {}, status: 'Invited'}); st.tab = 'roles'; st.lastRefusal = ''; AFMPolicy.render(); } catch (e) {} },
  steps: [
   ready('admin', 'policy'),
   {id: 'tab', kind: 'action', text: 'Choose <b>2. Users and roles</b>.', target: () => q('[data-ptab="users"]'), check: () => POL().tab === 'users' || 'Open the Users and roles tab.'},
   {id: 'store', kind: 'action', text: 'On <b>Divya</b>’s row, tick the store <b>Ulundurpet Main Store</b>.', target: () => q('[data-ustore="U8:Ulundurpet Main Store"]'),
    check: () => (divya()?.stores || []).includes('Ulundurpet Main Store') || 'Ulundurpet Main Store is not ticked for Divya yet.'},
   {id: 'role', kind: 'action', text: 'Tick <b>Cashier</b> for Divya.', target: () => q('[data-urole="U8:cashier"]'),
    check: () => (divya()?.roles || []).includes('cashier') || 'Divya does not have the Cashier role yet.'},
   {id: 'conflict', kind: 'action', text: 'Now also tick <b>Store manager</b> for Divya, and read the message that appears.', target: () => q('[data-urole="U8:store_manager"]'),
    check: () => (POL().lastRefusal || '').includes('Cashier with Store manager') || 'Tick Store manager for Divya to see what happens.'},
   ask('why', 'Why was Store manager refused?', ['Divya could approve exceptions at her own counter', 'Store managers need two stores', 'Divya is not active yet'], 0, 'Cashier and Store manager together would let one person both cause and approve an exception.'),
   {id: 'limit', kind: 'action', text: 'Set Divya’s discount limit to <b>5</b> and press Tab.', target: () => q('[data-ulimit="U8:discount"]'),
    check: () => (divya()?.limits?.discount === 5) || 'Divya’s discount limit is not 5 yet.'},
  ]},
 {title: 'Add product images', screen: 'catalogue', decisions: [],
  situation: 'Aavin Milk 500ml is about to go on ONDC and the marketplaces, but it has no photo. Listings without a clear main image are often rejected, and shoppers skip them.',
  why: 'The main image is the first thing a customer sees on every channel. Grocery listings on ONDC also need ingredient and nutrition images, so customers can check what they are buying.',
  handoff: 'The images go to every channel at the next catalogue publish; publishing warns about products still missing them.',
  risk: 'A small, blurred or cluttered photo makes a listing look untrustworthy, and a wrong photo can make customers order the wrong product.',
  note: 'Images must be JPG, PNG or WebP, at least 500 × 500 pixels and at most 5 MB. This practice offers a training sample photo; you can also upload your own. Images are saved in your browser only.',
  setup: () => { try { const st = AFMCatalogue.state(); delete st.images['8901002']; localStorage.setItem('afm-catalogue-v1', JSON.stringify(st)); AFMCatalogue.render(); } catch (e) {} },
  steps: [
   ready('catalogue', 'catalogue'),
   {id: 'open', kind: 'action', text: 'On <b>Aavin Milk 500ml</b>, choose <b>Edit</b>.', target: () => q('[data-cat-edit="8901002"]'),
    check: () => isM('Edit product · Aavin Milk 500ml') || 'Open Edit on Aavin Milk 500ml.'},
   {id: 'add', kind: 'action', text: 'Under <b>Images</b>, choose <b>Use the training sample photo</b>. It is added as the <b>Front</b> image and becomes the <b>Main</b> image.',
    target: () => q('#ceImgSample'),
    check: () => { const m = window.AFMCatalogue && AFMCatalogue.mainImage('8901002'); return (m && m.role === 'Front') || 'No main image yet. Choose Use the training sample photo.'; }},
   {id: 'read', kind: 'read', target: () => q('#ceImages'),
    text: 'Read the image card: <b>1000 × 1000 px</b>, type <b>Front</b>, marked <b>Main</b>. Image changes are saved straight away; close the window when you have checked it. The Catalogue table now shows the photo instead of the icon.'},
   ask('size', 'A supplier sends a 300 × 300 pixel photo. What happens if you upload it?', ['It is refused: images must be at least 500 × 500 pixels', 'It is stretched to fit', 'It is accepted but marked as low quality'], 0, 'Marketplaces reject small images, so the catalogue refuses them before they reach any channel.'),
  ]}
]},
};

// ---- intercept Complete sale during the payment step ---------------------
function currentStep() { const c = COURSES[mem.course]; const l = c && c.lessons[mem.lesson]; return l && mem.view === 'lesson' ? l.steps[mem.step] : null; }
try {
  const baseComplete = complete;
  complete = function () {
    const st = currentStep();
    if (mem.course === 'cashier' && mem.lesson === 3 && st && st.id === 'pay') {
      const ref = (q('#payReference')?.value || '').trim();
      let block = null;
      if (P.payType() !== 'upi') block = 'Choose UPI before completing the sale.';
      else if (ref !== UPI_REF) block = `Type the terminal reference ${UPI_REF} first. Never complete a sale before you have the terminal’s confirmation.`;
      else if (P.total() !== 93.45) block = `The total is ${rs(P.total())}, not ₹93.45. Go back to lesson 3.`;
      if (block) { flash(block); return; }
      const n = P.sale();
      const res = baseComplete.apply(this, arguments);
      mem.paid = {type: 'upi', ref, amount: 93.45}; mem.receipt = n; save(); tick(true);
      return res;
    }
    if (st && st.completeCheck) {
      const block = st.completeCheck(); if (block) { flash(block); return; }
      const n = P.sale(); const res = baseComplete.apply(this, arguments); st.afterComplete?.(n); save(); tick(true); return res;
    }
    return baseComplete.apply(this, arguments);
  };
} catch (e) { /* platform without complete(): payment lesson will show its own message */ }

// ---- teacher voice ---------------------------------------------------------
// Clips come from window.AFM_TRAINING_AUDIO ({id: url}) or, failing that,
// window.AFM_TRAINING_AUDIO_BASE + id + '.mp3'.
if (mem.voiceOn === undefined) mem.voiceOn = true;
const player = new Audio(); player.preload = 'auto';
let playingId = null, needTap = false;
const audioKey = id => (isTa() ? 'ta:' : '') + id;
const hasVoice = () => !!(window.AFM_TRAINING_AUDIO && Object.keys(window.AFM_TRAINING_AUDIO).some(k => isTa() ? k.startsWith('ta:') : !k.startsWith('ta:')));
const clipUrl = id => (window.AFM_TRAINING_AUDIO && window.AFM_TRAINING_AUDIO[audioKey(id)]) || (window.AFM_TRAINING_AUDIO_BASE ? window.AFM_TRAINING_AUDIO_BASE.replace(/\/?$/, '/') + id + '.mp3' : null);
function stopVoice() { try { player.pause(); } catch (e) {} playingId = null; voiceUI(); }
function playVoice(id, force) {
  if (!hasVoice()) return;
  if (!id || (!mem.voiceOn && !force)) return;
  const url = clipUrl(id); if (!url) return;
  try { player.pause(); } catch (e) {}
  player.src = url; playingId = id; needTap = false;
  const pr = player.play(); if (pr && pr.catch) pr.catch(() => { needTap = true; playingId = null; voiceUI(); });
  voiceUI();
}
player.addEventListener('ended', () => { playingId = null; voiceUI(); });
function voiceUI() {
  const b = q('#gt [data-gt="voice"]'); if (b) { b.textContent = mem.voiceOn ? U('🔊 Voice on') : U('🔇 Voice off'); b.setAttribute('aria-pressed', mem.voiceOn); }
  const r = q('#gt [data-gt="replay"]'); if (r) r.textContent = playingId ? U('■ Stop') : needTap ? U('▶ Tap to listen') : U('↻ Replay');
}
function clipFor() {
  if (!mem.course) return null;
  const pre = `${mem.course}-${mem.lesson}-`;
  if (mem.view === 'intro') return pre + 'intro';
  if (mem.view === 'done') return pre + 'done';
  if (mem.view === 'lesson') { const st = COURSES[mem.course].lessons[mem.lesson].steps[mem.step]; return st ? pre + st.id : null; }
  return null;
}

// ---- UI ------------------------------------------------------------------
const css = `
body.gt-on .training-banner,body.gt-on .training-fab,body.gt-on #command .teacher-home,body.gt-on #command .process-cockpit,body.gt-on [data-action-lab],body.gt-on [data-expert-coach],body.gt-on .process-coach{display:none!important}
#gt-launch{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:8999;border:0;border-radius:999px;background:#e0a526;color:#12352f;padding:12px 18px;cursor:pointer;font:inherit;font-weight:800;box-shadow:0 6px 20px rgba(18,53,47,.25)}
body.gt-open #gt-launch{display:none}
@media (max-width:900px){#gt-launch{bottom:calc(78px + env(safe-area-inset-bottom,0px))}}
#gt{position:fixed;top:0;right:0;bottom:0;width:380px;z-index:9000;background:#fff;color:#12352f;border-left:1px solid #cfe0d8;display:flex;flex-direction:column;font-family:inherit;box-shadow:-8px 0 30px rgba(18,53,47,.12);padding-bottom:env(safe-area-inset-bottom,0px)}
#gt[hidden]{display:none}
body.gt-open{padding-right:380px}
body.gt-open #overlay{right:380px}
.gt-head{background:#12352f;color:#fff;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 12px;display:flex;align-items:center;gap:10px}
.gt-head b{font-size:15px;flex:1}
.gt-head button{background:transparent;border:1px solid #6f8f86;color:#fff;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;font-size:13px}
.gt-body{overflow:auto;padding:16px;flex:1}
.gt-body h2{font-size:20px;line-height:1.25;margin:2px 0 6px}
.gt-meta{font-size:13px;color:#4a5a56;margin:0 0 12px}
.gt-course{display:block;width:100%;text-align:left;border:1px solid #cfe0d8;background:#fff;border-radius:12px;padding:14px;margin:0 0 10px;cursor:pointer;font:inherit;color:inherit}
.gt-course:hover,.gt-course:focus-visible{border-color:#12352f}
.gt-course b{display:block;font-size:16px}
.gt-course small{color:#4a5a56}
.gt-lessons{list-style:none;margin:8px 0 14px;padding:0}
.gt-lessons li{margin:0 0 6px}
.gt-lessons button{width:100%;display:flex;gap:10px;align-items:center;text-align:left;border:1px solid #cfe0d8;background:#fff;border-radius:10px;padding:10px;cursor:pointer;font:inherit;color:inherit}
.gt-lessons button:disabled{opacity:.5;cursor:not-allowed}
.gt-n{flex:0 0 26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800;border:2px solid #12352f}
.gt-n.done{background:#1f7a55;border-color:#1f7a55;color:#fff}
.gt-story p{margin:0 0 10px;line-height:1.55;font-size:14.5px}
.gt-story b{display:block;font-size:13px;margin-bottom:2px}
.gt-note{background:#e3f1ea;border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin:0 0 10px}
.gt-dec{background:#fbecc4;border:1px solid #e0a526;border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.5;margin:0 0 10px}
.gt-steps{list-style:none;margin:0;padding:0}
.gt-step{border:1px solid #cfe0d8;border-radius:12px;padding:12px;margin:0 0 8px;font-size:14.5px;line-height:1.55}
.gt-step.done{display:none}
.gt-donecount{font-size:13px;color:#1f7a55;font-weight:700;margin:0 0 8px}
.gt-step.done::before{content:"✓ ";color:#1f7a55;font-weight:800}
.gt-step.now{border:2px solid #12352f}
.gt-step.later{display:none}
.gt-msg{margin-top:8px;font-size:13.5px;color:#8a5a00;background:#fff7e3;border-radius:8px;padding:7px 9px}
.gt-msg.ok{color:#1f7a55;background:#e7f6ee}
.gt-opts{display:grid;gap:6px;margin-top:8px}
.gt-opts button{text-align:left;border:1px solid #cfe0d8;background:#fff;border-radius:9px;padding:8px 10px;cursor:pointer;font:inherit;font-size:14px;color:inherit}
.gt-opts button.right{border-color:#1f7a55;background:#e7f6ee}
.gt-opts button.wrong{border-color:#b54708;background:#fff1e7}
.gt-btn{border:1px solid #12352f;background:#12352f;color:#fff;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;font:inherit;font-weight:700;margin-top:8px}
.gt-btn:disabled{opacity:.45;cursor:not-allowed}
.gt-btn.alt{background:#fff;color:#12352f}
.gt-replay{float:right;margin:0 0 6px 8px;border:1px solid #cfe0d8;background:#fff;color:#12352f;border-radius:999px;padding:3px 10px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.gt-head button[data-gt="voice"]{white-space:nowrap}
.gt-terminal{display:block;margin:6px 0;padding:8px 10px;border-radius:8px;background:#12352f;color:#9ff0c9;font-variant-numeric:tabular-nums}
.gt-target{outline:3px solid #e0a526!important;outline-offset:3px!important;border-radius:6px;animation:gtpulse 1.6s ease-in-out infinite}
@keyframes gtpulse{50%{outline-color:rgba(224,165,38,.35)}}
@media (prefers-reduced-motion:reduce){.gt-target{animation:none}}
#gt :focus-visible{outline:3px solid #e0a526;outline-offset:2px}
@media (max-width:900px){#gt{top:auto;left:0;width:auto;height:48vh;border-left:0;border-top:1px solid #cfe0d8;border-radius:14px 14px 0 0}
 body.gt-open{padding-right:0;padding-bottom:48vh} body.gt-open #overlay{right:0;bottom:48vh}
 #gt.min{height:auto} #gt.min .gt-body{display:none} body.gt-open.gt-min{padding-bottom:56px} body.gt-open.gt-min #overlay{bottom:56px}}
@media (min-width:901px){#gt.min{width:220px;bottom:auto;border-radius:0 0 0 12px} #gt.min .gt-body{display:none} body.gt-open.gt-min{padding-right:0} body.gt-open.gt-min #overlay{right:0}}
`;
document.head.insertAdjacentHTML('beforeend', '<style id="gt-style">' + css + '</style>');
document.body.classList.add('gt-on');
document.body.insertAdjacentHTML('beforeend', '<aside id="gt" hidden aria-label="Guided training"><div class="gt-head"><b>Guided training</b><button data-gt="voice" aria-pressed="true">🔊 Voice on</button><button data-gt="min" aria-label="Minimise training">–</button><button data-gt="close">Close</button></div><div class="gt-body" id="gt-body"></div></aside>');
document.body.insertAdjacentHTML('beforeend', '<button id="gt-launch" type="button">🎓 Guided training</button>');

const panel = q('#gt'), body = q('#gt-body');
let lastStepKey = '', lastHTML = '', target = null, flashMsg = null, flashT, guard = null;
function flash(m) { flashMsg = m; clearTimeout(flashT); flashT = setTimeout(() => { flashMsg = null; tick(true); }, 6000); tick(true); }
function open() { panel.hidden = false; document.body.classList.add('gt-open'); render(true); }
function close() { panel.hidden = true; document.body.classList.remove('gt-open', 'gt-min'); panel.classList.remove('min'); setTarget(null); }
function setTarget(el) { if (target === el) return; target?.classList.remove('gt-target'); target = el; if (el) { el.classList.add('gt-target'); const r = el.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 20) el.scrollIntoView({block: 'center', behavior: 'smooth'}); } }
const txt = v => typeof v === 'function' ? v() : v;
const decHTML = ids => ids.length ? `<div class="gt-dec"><b>${U('Waiting for your decision')}</b><br>${ids.map(id => esc(isTa() ? TA.dec[id] : DECISIONS[id])).join('<br>')}<br><small>${U('The steps and narration avoid this point for now. The lesson will be updated once it is decided.')}</small></div>` : '';

function viewHome() {
  return `<h2>${U('Hands-on training')}</h2><p class="gt-meta">${U('You work on the real screens. Each step checks what the system actually shows before it moves on.')}</p>
  ${Object.entries(COURSES).map(([k, c]) => `<button class="gt-course" data-gt-course="${k}"><b>${esc(ctitle(k))}</b><small>${UT('lessons_done', `${(mem.done[k] = mem.done[k] || []).length} of ${c.lessons.length} lessons completed`, {n: mem.done[k].length, m: c.lessons.length})}</small></button>`).join('')}`;
}
function viewCourse() {
  const c = COURSES[mem.course]; mem.done[mem.course] = mem.done[mem.course] || [];
  return `<p class="gt-meta"><a href="#" data-gt="home">${U('All courses')}</a></p><h2>${esc(ctitle(mem.course))}</h2>
  <ol class="gt-lessons">${c.lessons.map((l, i) => { const d = mem.done[mem.course].includes(i), open = i === 0 || mem.done[mem.course].includes(i - 1) || d;
    return `<li><button data-gt-lesson="${i}" ${open ? '' : 'disabled'}><span class="gt-n ${d ? 'done' : ''}">${d ? '✓' : i + 1}</span><span>${esc(lf(mem.course, i, 'title'))}<br><small>${d ? U('Completed') : open ? U('Ready') : UT('complete_first', 'Complete lesson ' + i + ' first', {n: i})}</small></span></button></li>`; }).join('')}</ol>`;
}
function viewIntro() {
  const c = mem.course, i = mem.lesson, l = COURSES[c].lessons[i];
  return `<p class="gt-meta"><a href="#" data-gt="course">${esc(ctitle(c))}</a> · ${UT('lesson_of', `Lesson ${i + 1} of ${COURSES[c].lessons.length}`, {n: i + 1, m: COURSES[c].lessons.length})}</p><h2>${esc(lf(c, i, 'title'))}</h2>
  <div class="gt-story"><p><b>${U('What happened')}</b>${esc(lf(c, i, 'situation'))}</p><p><b>${U('Why it matters')}</b>${esc(lf(c, i, 'why'))}</p><p><b>${U('Who receives your work')}</b>${esc(lf(c, i, 'handoff'))}</p><p><b>${U('What can go wrong')}</b>${esc(lf(c, i, 'risk'))}</p></div>
  ${P.modal() ? `<div class="gt-msg">${UT('window_open', `A window from the previous step is still open (${esc(P.modal())}). Close it before you start.`)}</div>` : ''}${decHTML(l.decisions)}${hasVoice() ? '' : `<div class="gt-note">${otherPageNote()}</div>`}<button class="gt-btn" data-gt="start">${U('Start hands-on')}</button>${hasVoice() ? ` <button class="gt-btn alt" data-gt="replay">${U('↻ Replay')}</button>` : ''}`;
}
function stepHTML(s, i, l) {
  const c = mem.course, li = mem.lesson;
  const cls = i < mem.step ? 'done' : i === mem.step ? 'now' : 'later';
  const A = s.kind === 'ask' ? askOf(s, c, li) : null;
  let inner = A ? A.text : stepText(s, c, li);
  if (i === mem.step && hasVoice()) inner = `<button class="gt-replay" data-gt="replay" aria-label="${U('Replay the teacher')}">${U('↻ Replay')}</button>` + inner;
  if (i === mem.step && guard) inner += `<div class="gt-msg">${esc(TM(guard))}</div>`;
  if (i === mem.step && flashMsg && s.kind !== 'action') inner += `<div class="gt-msg">${esc(TM(flashMsg))}</div>`;
  if (i === mem.step) {
    if (s.kind === 'ask') {
      const a = mem.answers[`${c}-${li}-${s.id}`];
      const n = s.options.length, rot = [...s.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % n;
      const order = s.options.map((_, k) => (k + rot) % n);
      inner += `<div class="gt-opts">${order.map(k => `<button data-gt-opt="${k}" class="${a === undefined ? '' : k === s.correct ? 'right' : k === a ? 'wrong' : ''}">${esc(A.options[k])}</button>`).join('')}</div>`;
      if (a !== undefined) inner += `<div class="gt-msg ${a === s.correct ? 'ok' : ''}">${a === s.correct ? U('Correct. ') : U('Not quite. ')}${esc(A.why)}</div>` + (a === s.correct ? `<button class="gt-btn" data-gt="next">${U('Continue')}</button>` : '');
    } else if (s.kind === 'read') inner += `<br><button class="gt-btn" data-gt="next">${U('I have checked this')}</button>`;
    else if (s.kind === 'verify') { const r = s.check(); inner += r === true ? `<div class="gt-msg ok">${U('The basket matches.')}</div>` : `<div class="gt-msg">${esc(TM(r))}</div>`;
      inner += `<button class="gt-btn" data-gt="verify" ${r === true ? '' : 'disabled aria-disabled="true"'}>${esc(verifyLabel(s, c, li))}</button>`; }
    else { const r = s.check(); if (flashMsg) inner += `<div class="gt-msg">${esc(TM(flashMsg))}</div>`; else if (r !== true) inner += `<div class="gt-msg">${esc(TM(r))}</div>`;
      if (s.fix && /Reset/.test(String(r))) inner += `<button class="gt-btn alt" data-gt="fix">${esc(TL(c, li)?.fix || s.fix.label)}</button>`; }
  }
  return `<li class="gt-step ${cls}">${inner}</li>`;
}
function viewLesson() {
  const c = mem.course, i = mem.lesson, l = COURSES[c].lessons[i], n = l.steps.length;
  return `<p class="gt-meta"><a href="#" data-gt="course">${esc(ctitle(c))}</a> · ${UT('lesson_step', `Lesson ${i + 1}: ${esc(l.title)} · Step ${Math.min(mem.step + 1, n)} of ${n}`, {n: i + 1, t: esc(lf(c, i, 'title')), s: Math.min(mem.step + 1, n), m: n})}</p>
  ${mem.step ? `<p class="gt-donecount">${UT('steps_done', `✓ ${mem.step} of ${n} steps done`, {n: mem.step, m: n})}</p>` : ''}<ol class="gt-steps">${l.steps.map((s, k) => stepHTML(s, k, l)).join('')}</ol>
  <div class="gt-note"><b>${U('In this practice system')}</b><br>${esc(lf(c, i, 'note'))}</div>${decHTML(l.decisions)}`;
}
function viewDone() {
  const c = mem.course, i = mem.lesson, C = COURSES[c], last = i === C.lessons.length - 1;
  return `${hasVoice() ? `<button class="gt-replay" data-gt="replay">${U('↻ Replay')}</button>` : ''}<h2>${UT('lesson_complete', `Lesson ${i + 1} complete`, {n: i + 1})}</h2><p class="gt-meta">${esc(lf(c, i, 'title'))}</p><div class="gt-note">${U('Every step was checked against what the system showed.')}</div>
  ${last ? `<p>${UT('course_complete', `You have completed the ${esc(C.title)} course.`, {c: esc(ctitle(c))})}</p><button class="gt-btn" data-gt="course">${U('Back to lessons')}</button>` : `<button class="gt-btn" data-gt-lesson="${i + 1}">${UT('next', `Next: ${esc(C.lessons[i + 1].title)}`, {t: esc(lf(c, i + 1, 'title'))})}</button> <button class="gt-btn alt" data-gt="course">${U('All lessons')}</button>`}`;
}
function chrome() {
  const h = q('#gt .gt-head b'); if (h) h.textContent = U('Guided training');
  const cb = q('#gt [data-gt="close"]'); if (cb) cb.textContent = U('Close');
  const mb = q('#gt [data-gt="min"]'); if (mb) mb.setAttribute('aria-label', U('Minimise training'));
  const lb = q('#gt-launch'); if (lb) lb.textContent = U('🎓 Guided training');
  panel.setAttribute('aria-label', U('Guided training'));
  const vb = q('#gt [data-gt="voice"]'); if (vb) vb.style.display = hasVoice() ? '' : 'none';
}
function render(force) {
  chrome();
  if (panel.hidden) return;
  const html = ({home: viewHome, course: viewCourse, intro: viewIntro, lesson: viewLesson, done: viewDone})[mem.view]?.() || viewHome();
  if (force || html !== lastHTML) { const y = body.scrollTop, stepChanged = lastStepKey !== `${mem.view}-${mem.lesson}-${mem.step}`; body.innerHTML = html; body.scrollTop = stepChanged ? 0 : y; lastHTML = html; lastStepKey = `${mem.view}-${mem.lesson}-${mem.step}`; if (stepChanged) { const c = clipFor(); c ? playVoice(c) : stopVoice(); } voiceUI(); }
}
function tick(force) {
  const k = `${mem.course}-${mem.lesson}-${mem.view}-${mem.step}`; if (k !== stepKey) { stepKey = k; stepT0 = Date.now(); }
  if (panel.hidden) return;
  if (mem.view === 'lesson' || mem.view === 'intro') {
    const sw = swappedScreens();
    if (sw.length && !P.modal()) { try { screens(); } catch (e) {} flash(`The ${sw.join(', ')} screen${sw.length > 1 ? 's had' : ' had'} switched to the AI catalogue version after a language change. The store version has been restored so it matches this lesson.`); }
  }
  if (mem.view === 'lesson') {
    const l = COURSES[mem.course].lessons[mem.lesson], s = l.steps[mem.step];
    if (!s) { finish(); return; }
    if (s.kind === 'action' && s.check() === true) { s.onPass?.(); mem.step++; flashMsg = null; save(); return tick(true); }
    // keep the learner on the right persona/screen for every later step
    const r = mem.step > 0 && l.steps[0].id === 'ready' ? l.steps[0].check() : true;
    guard = r !== true && /^(The system is showing|Open |Set the language)/.test(r) ? r : null;
    setTarget(s.target ? s.target() : null);
  } else { guard = null; setTarget(null); }
  render(force);
}
function finish() {
  const d = (mem.done[mem.course] = mem.done[mem.course] || []); if (!d.includes(mem.lesson)) d.push(mem.lesson);
  mem.view = 'done'; save(); setTarget(null); render(true);
}
function startLesson(i) {
  mem.lesson = i; mem.step = 0; mem.view = 'intro';
  Object.keys(mem.answers).filter(k => k.startsWith(`${mem.course}-${i}-`)).forEach(k => delete mem.answers[k]);
  if (mem.course === 'cashier' && i === 3) { mem.paid = null; mem.receipt = null; }
  save(); render(true);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#overlay, #gt')) { const b = e.target.closest('button, a, [data-a], [data-module]'); if (b) lastOpen = b; }
  const cs = currentStep();
  if (cs && cs.click && e.target.closest(cs.click)) { mem.answers[`${mem.course}-${mem.lesson}-${cs.id}-clicked`] = 1; save(); setTimeout(() => tick(true), 80); }
  const gs = cs ? [].concat(cs.guard || [], cs.guard2 || []) : []; const gd = gs.find(x => e.target.closest(x.sel)); if (gd) { const m = gd.check(e.target.closest(gd.sel)); if (m) { e.preventDefault(); e.stopImmediatePropagation(); flash(m); return; } }
  for (const cs2 of ['#submitCount', '#saveStore', '#saveRules', '#saveDrawer', '#completeReturn', '#modalFoot [data-a="submit"]', '#commitStrongApproval']) if (e.target.closest(cs2)) commits[cs2] = Date.now();
  if (e.target.closest('#gt-launch')) { panel.hidden ? open() : close(); return; }
  const g = e.target.closest('#gt [data-gt],#gt [data-gt-course],#gt [data-gt-lesson],#gt [data-gt-opt]');
  if (!g) { setTimeout(() => tick(), 60); return; }
  e.preventDefault();
  if (g.dataset.gtCourse) { mem.course = g.dataset.gtCourse; mem.view = 'course'; save(); return render(true); }
  if (g.dataset.gtLesson !== undefined) return startLesson(+g.dataset.gtLesson);
  if (g.dataset.gtOpt !== undefined) {
    const s = currentStep(); const key = `${mem.course}-${mem.lesson}-${s.id}`; const k = +g.dataset.gtOpt;
    if (mem.answers[key] !== s.correct) { mem.answers[key] = k; save(); playVoice(k === s.correct ? 'fb-correct' : 'fb-wrong'); }
    return render(true);
  }
  const a = g.dataset.gt;
  if (a === 'close') { stopVoice(); return close(); }
  if (a === 'voice') { mem.voiceOn = !mem.voiceOn; save(); if (!mem.voiceOn) stopVoice(); else playVoice(clipFor()); return voiceUI(); }
  if (a === 'replay') { if (playingId) stopVoice(); else playVoice(clipFor(), true); return; }
  if (a === 'min') { panel.classList.toggle('min'); document.body.classList.toggle('gt-min', panel.classList.contains('min')); g.textContent = panel.classList.contains('min') ? '+' : '–'; return; }
  if (a === 'home') { mem.view = 'home'; save(); return render(true); }
  if (a === 'course') { mem.view = 'course'; save(); return render(true); }
  if (a === 'start') { COURSES[mem.course].lessons[mem.lesson].setup?.(); markAudit(); mem.view = 'lesson'; mem.step = 0; save(); return tick(true); }
  if (a === 'next') { mem.step++; save(); return tick(true); }
  if (a === 'verify') { const st = currentStep(); if (st && st.check() === true) { mem.step++; save(); } return tick(true); }
  if (a === 'fix') { currentStep()?.fix?.run(); return tick(true); }
}, true);
['input', 'change', 'keyup'].forEach(t => document.addEventListener(t, () => setTimeout(() => tick(), 60), true));
setInterval(() => tick(), 700);
if (mem.view === 'lesson' && mem.course) { COURSES[mem.course].lessons[mem.lesson].setup?.(); }
if (!localStorage.getItem(KEY)) open(); else if (mem.view === 'lesson') open();
// ---- content/screen sync recorder (for validation runs) -------------------
const audit = {};
const norm = t => String(t).toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[“”"’']/g, '').trim();
function auditTick() {
  if (mem.view !== 'lesson') return;
  const l = COURSES[mem.course]?.lessons[mem.lesson], st = l?.steps[mem.step]; if (!st) return;
  const key = `${mem.course} L${mem.lesson + 1} ${st.id}`;
  const box = document.createElement('div'); box.innerHTML = txt(st.text);
  const terms = [...box.querySelectorAll('b')].flatMap(b => b.textContent.trim().replace(/[.,;:]$/, '').split(/: | = | \+ (?=₹)|, (?=[A-Z])/)).map(t => t.trim()).filter(Boolean);
  const vals = [...document.querySelectorAll('.top input, .top select, .shell input, .shell select, #overlay.show input, #overlay.show select')].map(f => f.tagName === 'SELECT' ? [...f.options].map(o => o.text).join(' ') : f.value);
  const scr = norm([q('.top')?.innerText, q('.shell')?.innerText, q('#overlay.show') ? q('#overlay').innerText : '', ...vals].join(' '));
  const a = audit[key] || (audit[key] = {terms, seen: new Set()});
  terms.forEach(t => { if (scr.includes(norm(t))) a.seen.add(t); });
}
setInterval(auditTick, 250);
const auditReport = () => Object.entries(audit).map(([k, v]) => ({step: k, missing: v.terms.filter(t => !v.seen.has(t))})).filter(x => x.missing.length);
window.AFMGuidedTraining = {auditReport, open, close, playVoice, stopVoice, reset: () => { localStorage.removeItem(KEY); location.reload(); }, courses: COURSES};
})();

