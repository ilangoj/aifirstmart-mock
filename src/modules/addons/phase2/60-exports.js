// ================================================================ exports and printing
function download(name, rows) {
  const csv = rows.map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv'})); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  audit('Reports', 'Exported', name);
}
function tableRows(table) { return qa('tr', table).map(tr => qa('th,td', tr).map(c => c.innerText.replace(/\s+/g, ' ').trim())); }
function exportsAndPrint() {
  const t = q('#overlay.show #modalTitle');
  if (t && /Approval history/.test(t.textContent) && !q('#overlay.show [data-export="approvals"]')) {
    q('#overlay.show #modalFoot')?.insertAdjacentHTML('afterbegin', '<button class="btn" data-export="approvals">Export CSV</button><button class="btn" data-print>Print</button>');
  }
  const cmd = q('#command .pagehead .actions');
  if (cmd && ['owner', 'finance'].includes(persona()) && !q('#command [data-print]')) cmd.insertAdjacentHTML('beforeend', '<button class="btn" data-print>Print summary</button>');
  const au = q('#audit .pagehead .actions, #audit .pagehead');
  if (au && !q('#audit [data-print]')) (q('#audit .pagehead .actions') || au).insertAdjacentHTML('beforeend', '<button class="btn" data-print>Print</button>');
}

