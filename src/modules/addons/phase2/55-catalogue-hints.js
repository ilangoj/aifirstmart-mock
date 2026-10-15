// ================================================================ catalogue: edit hints and filter
let catFilter = '';
function catalogueHelp() {
  const host = q('#catalogue'), table = host && [...host.querySelectorAll('table.table')].find(t => [...t.querySelectorAll('th')].some(th => th.textContent === 'On hand'));
  if (!table) return;
  const price = pcan('pricing:write'), image = pcan('catalog:write');
  qa('[data-pricecell]', table).forEach(td => { if (price && !td.dataset.editable) { td.dataset.editable = '1'; td.setAttribute('aria-label', 'Change the price of ' + (td.parentElement.children[2]?.textContent || '')); } });
  if (!q('#catHelp', host)) table.parentElement.insertAdjacentHTML('beforebegin', `<div id="catHelp" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin:0 0 8px">
    <div class="field" style="margin:0;min-width:240px"><label for="catSearch">Find a product</label><input id="catSearch" type="search" placeholder="Name, barcode or category" value="${esc(catFilter)}"></div>
    <p style="margin:0 0 6px;font-size:13px">${[price ? '✎ Click a price to change it' : '', image ? '📋 Click an image, then paste a photo' : ''].filter(Boolean).join(' · ')}</p></div>`);
  const words = catFilter.toLowerCase().split(/\s+/).filter(Boolean); let shown = 0;
  qa('tbody tr', table).forEach(tr => { const hit = words.every(w => tr.textContent.toLowerCase().includes(w)); tr.style.display = hit ? '' : 'none'; shown += hit; });
  let none = q('#catNone', host); if (!shown && words.length) { if (!none) table.insertAdjacentHTML('afterend', '<p id="catNone">No product matches. Check the spelling or search by barcode.</p>'); } else none?.remove();
}

