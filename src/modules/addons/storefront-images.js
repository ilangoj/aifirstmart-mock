/* AIFirstMart mock: catalogue photos on every storefront.
 * The main image chosen in Catalogue is shown wherever a customer (or the till) sees the product:
 * Customer shop (web, mobile app, WhatsApp), the Mobile App and WhatsApp channel screens, and the
 * till's quick products. Storefronts refresh as soon as an image is added, changed, removed or
 * loaded from the database, and they warn when pasted images are still waiting for Save changes. */
(() => {
'use strict';
if (window.__afmImages) return; window.__afmImages = true;
const q = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const C = () => window.AFMCatalogue;
const list = () => { try { return items; } catch (e) { return []; } };
const item = sku => list().find(x => x.id === sku);
const main = sku => { try { return C()?.mainImage(sku) || null; } catch (e) { return null; } };
const STYLE = (n, block) => `width:${n}px;height:${n}px;object-fit:contain;background:#fff;border-radius:6px;${block ? 'display:block;margin:0 auto 4px' : 'vertical-align:middle'}`;

// One picture element for a product: its main photo, or its emoji when it has none.
function visual(sku, size, block) {
  const m = main(sku), it = item(sku);
  if (m) return `<img class="afm-thumb" data-thumb="${esc(sku)}" data-img-id="${esc(m.id)}" src="${m.data}" alt="${esc(it ? it.n : '')}" style="${STYLE(size, block)}">`;
  return `<span class="emoji afm-thumb" data-thumb="${esc(sku)}" data-img-id="" aria-hidden="true" style="${block ? `display:block;font-size:${Math.round(size / 2)}px` : ''}">${it?.e || '📦'}</span>`;
}
const current = el => el && el.classList.contains('afm-thumb') ? el.dataset.imgId : null;
function setVisual(el, sku, size, block) {
  if (!el) return;
  const want = main(sku)?.id || '';
  if (current(el) === want) return;
  el.outerHTML = visual(sku, size, block);
}

function decorate() {
  // Till quick products and the Mobile App cards.
  document.querySelectorAll('#products .product[data-add]').forEach(card => setVisual(card.querySelector('.emoji, .afm-thumb'), card.dataset.add, 56, true));
  document.querySelectorAll('#mobileapp .mproduct').forEach(card => {
    const sku = card.querySelector('[data-chadd]')?.dataset.chadd; if (sku) setVisual(card.querySelector('.emoji, .afm-thumb'), sku, 72, true);
  });
  // WhatsApp channel screen: product bubbles are "<b>emoji name</b> … <button data-chadd>".
  document.querySelectorAll('#whatsapp #chat button[data-chadd]').forEach(btn => {
    const sku = btn.dataset.chadd, it = item(sku); if (!it) return;
    let b = btn.previousElementSibling;
    while (b && b.tagName !== 'B') b = b.previousElementSibling;
    if (!b || !b.textContent.includes(it.n)) return;
    const pic = b.querySelector('.afm-thumb'), want = main(sku)?.id || '';
    if (pic ? current(pic) === want : !want) return;
    b.innerHTML = `${want ? visual(sku, 96, true) : esc(it.e || '📦') + ' '}${esc(it.n)}`;
  });
  // Customer shop: picture slots in the WhatsApp chat and the cart.
  document.querySelectorAll('[data-waimg]').forEach(slot => {
    const sku = slot.dataset.waimg, size = Number(slot.dataset.size || 72), want = main(sku)?.id || '';
    if (slot.dataset.shown === want && slot.childElementCount) return;
    slot.dataset.shown = want; slot.innerHTML = visual(sku, size, size > 40);
  });
  pendingNote();
}

// Pasted images are not on the storefront until they are saved: say so where the trainee is looking.
function pendingNote() {
  let n = 0; try { n = C()?.pending()?.images?.length || 0; } catch (e) {}
  for (const id of ['shop', 'mobileapp', 'whatsapp']) {
    const host = q('#' + id); if (!host) continue;
    let note = host.querySelector('[data-afm-pendnote]');
    if (!n) { note?.remove(); continue; }
    const text = `${n} pasted product image${n > 1 ? 's are' : ' is'} not saved yet, so shoppers cannot see ${n > 1 ? 'them' : 'it'}. In <b>Catalogue</b>, choose <b>Save changes</b>.`;
    if (note) { if (note.dataset.n !== String(n)) { note.dataset.n = n; note.querySelector('span').innerHTML = text; } continue; }
    host.insertAdjacentHTML('afterbegin', `<div data-afm-pendnote data-n="${n}" role="status" style="background:#fffbea;border:2px solid #d4a72c;border-radius:8px;padding:8px 10px;margin-bottom:10px"><span>${text}</span> <button class="link" data-afm-gocat>Open Catalogue →</button></div>`);
  }
}
document.addEventListener('click', e => { if (e.target.closest('[data-afm-gocat]')) q('#side [data-nav="catalogue"]')?.click(); }, true);

// Redraw storefronts when any product's main image changes (added, replaced, removed, or loaded from the database).
const signature = () => list().map(x => x.id + ':' + (main(x.id)?.id || '')).join('|');
let lastSig = null;
function watch() {
  const sig = signature();
  if (sig !== lastSig) {
    const first = lastSig === null; lastSig = sig;
    if (!first) {
      try { window.AFMPhase2?.renderShop(); } catch (e) {}
      try { if (q('#products') && typeof products === 'function') products(q('#scan')?.value || ''); } catch (e) {}
    }
  }
  decorate();
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; decorate(); }); })
  .observe(document.body, {childList: true, subtree: true});
setInterval(watch, 400);
watch();
window.AFMImages = {decorate, visual, signature};
})();
