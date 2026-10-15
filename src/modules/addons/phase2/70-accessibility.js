// ================================================================ accessibility
const A11Y_KEY = 'afm-a11y-v1';
let A11 = load(A11Y_KEY, () => ({zoom: 1, oneRole: null}));
function a11yStyles() {
  if (q('#afmA11yStyle')) return;
  document.head.insertAdjacentHTML('beforeend', `<style id="afmA11yStyle">
    :focus-visible{outline:3px solid #0969da!important;outline-offset:2px}
    .afm-textsize{min-width:44px}
    @media print{#side,.top .status,#gt,#gt-launch,.training-fab,[data-training-fab],.modalback:not(.show),.actions .btn{display:none!important}main,#main,.content{margin:0!important;width:100%!important}}
    @media (max-width:760px){.shop-grid{grid-template-columns:1fr!important}.top .status{flex-wrap:wrap;min-width:0;max-width:100%}.top .status select{max-width:100%}.persona-switch{max-width:100%;min-width:0;flex-wrap:wrap}.persona-switch select{max-width:calc(100vw - 120px)}.afm-phone{border-width:6px!important;border-radius:18px!important}#permMatrix th,#permMatrix td{min-width:0!important}}
    [data-onerole] #permMatrix .afm-hidecol{display:none}
    #toast{left:50%!important;right:auto!important;transform:translateX(-50%)!important;max-width:min(560px,92vw);text-align:center}
    [data-pricecell][data-editable]{text-decoration:underline dotted #8a8f98;text-underline-offset:4px}
    [data-pricecell][data-editable]::after{content:' ✎';color:#57606a;font-size:12px}
    @media (max-width:760px){#toast{top:76px!important;bottom:auto!important}
      .screen > .pagehead{flex-direction:column!important;align-items:stretch!important;gap:8px}
      .screen > .pagehead > .actions{flex-wrap:nowrap!important;overflow-x:auto;padding-bottom:4px}
      .screen > .pagehead > .actions .btn{flex:0 0 auto}
      #gt-launch{font-size:0!important;width:52px;height:52px;padding:0!important;border-radius:50%!important;display:flex;align-items:center;justify-content:center}
      #gt-launch::before{content:'🎓';font-size:22px}}
  </style>`);
}
function textSizeButton() {
  const status = q('.top .status'); if (!status || q('.afm-textsize')) return;
  status.insertAdjacentHTML('afterbegin', `<button class="pill afm-textsize" type="button" aria-label="Text size ${Math.round(A11.zoom * 100)}%. Click to change">A+ <small>${Math.round(A11.zoom * 100)}%</small></button>`);
}
function applyZoom() { const m = q('main') || q('.content') || q('#main'); document.body.style.zoom = A11.zoom === 1 ? '' : String(A11.zoom); }
function matrixRoleView() {
  const mx = q('#permMatrix'); if (!mx) return;
  const heads = qa('thead tr:nth-child(2) th', mx).map(th => th.textContent.trim());
  if (!heads.length) return;
  if (!q('#oneRolePick')) mx.insertAdjacentHTML('beforebegin', `<div class="field" style="max-width:320px"><label for="oneRolePick">Show</label><select id="oneRolePick"><option value="">All roles side by side</option>${heads.map((h, i) => `<option value="${i}" ${String(A11.oneRole) === String(i) ? 'selected' : ''}>${esc(h)} only</option>`).join('')}</select></div>`);
  const sel = A11.oneRole == null || A11.oneRole === '' ? null : Number(A11.oneRole);
  const policy = q('#policy'); if (!policy) return;
  if (sel == null) { policy.removeAttribute('data-onerole'); qa('.afm-hidecol', mx).forEach(c => c.classList.remove('afm-hidecol')); return; }
  policy.setAttribute('data-onerole', '');
  const n = heads.length;
  qa('tbody tr, thead tr:nth-child(2)', mx).forEach(tr => { const cells = qa('td,th', tr); const off = cells.length === n + 1 ? 1 : cells.length === n ? 0 : -1; if (off < 0) return;
    cells.forEach((c, i) => c.classList.toggle('afm-hidecol', i >= off && i - off !== sel)); });
  qa('thead tr:first-child th', mx).forEach((th, i) => th.classList.toggle('afm-hidecol', i > 0));
}

