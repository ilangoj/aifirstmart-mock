
/* AIFirstMart mock: editable catalogue and import staging (review, edit or delete rows before committing). */
(() => {
'use strict';
if (window.__afmCatalogue) return; window.__afmCatalogue = true;
const KEY = 'afm-catalogue-v1';
const q = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const CATS = ['Grocery', 'Dairy', 'Fresh produce', 'Personal care', 'Household'];
const EDITORS = ['admin', 'catalogue'];
const role = () => { try { return session.activePersona; } catch (e) { return ''; } };
const canEdit = () => window.AFMPolicy ? window.AFMPolicy.can('catalog:write') : EDITORS.includes(role());
const canPrice = () => window.AFMPolicy ? window.AFMPolicy.can('pricing:write') : EDITORS.includes(role());
const canImport = () => window.AFMPolicy ? window.AFMPolicy.can('catalog:import') : EDITORS.includes(role());
const all = () => { try { return items; } catch (e) { return []; } };
const rupees = p => '₹' + Number(p).toFixed(2);
const audit = (a, d) => { try { auditEvent('Catalogue', a, d); } catch (e) {} };
let S; try { S = Object.assign({edits: {}, added: [], stage: null, images: {}}, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { S = {edits: {}, added: [], stage: null, images: {}}; }
S.images = S.images || {};
let PENDING = {prices: {}, images: []};          // unsaved table edits: {sku: paise/100}, [{sku, rec}]
let DBS = {state: 'checking', savedAt: null, db: null, uid: null};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { toast('This practice browser’s storage is full. Remove an image and try again'); return false; } };

// Re-apply saved changes to the platform's product list (it is rebuilt on every page load).
function reapply() {
  const list = all();
  for (const a of S.added) if (!list.some(x => x.id === a.id)) list.push({...a});
  for (const [id, e] of Object.entries(S.edits)) { const it = list.find(x => x.id === id); if (it) Object.assign(it, e); }
}

// ---------------- page
function render() {
  const el = q('#catalogue'); if (!el) return;
  const ed = canEdit();
  const thumb = x => { const m = mainImage(x.id); return m ? `<img src="${m.data}" alt="${esc(x.n)}" style="width:40px;height:40px;object-fit:contain;border:1px solid #ddd;border-radius:6px;background:#fff">` : `<span style="font-size:24px" title="No image yet">${x.e || '📦'}</span>`; };
  const pend = PENDING, pi = sku => pend.images.filter(i => i.sku === sku);
  const imgCell = x => { const p = pi(x.id); return `<td tabindex="0" data-imgcell="${esc(x.id)}" title="${ed ? 'Click, then paste an image (Ctrl+V / ⌘V)' : 'Images'}" style="cursor:${ed ? 'copy' : 'default'};${p.length ? 'background:#fff4d6' : ''}">${p.length ? `<img src="${p[p.length - 1].rec.data}" alt="New image" style="width:40px;height:40px;object-fit:contain;border:1px solid #d4a72c;border-radius:6px;background:#fff"><br><small>${p.length} unsaved</small>` : thumb(x)}</td>`; };
  const priceCell = x => { const np = pend.prices[x.id]; return `<td data-pricecell="${esc(x.id)}" tabindex="0" title="${canPrice() ? 'Click to change the price' : 'Price changes need the Pricing and promotions role'}" style="cursor:${canPrice() ? 'text' : 'default'};${np != null ? 'background:#fff4d6' : ''}">${np != null ? `<s style="color:#888">${rupees(x.p)}</s> <b>${rupees(np)}</b>` : rupees(x.p)}</td>`; };
  const rows = all().map(x => `<tr>${imgCell(x)}<td>${esc(x.id)}</td><td>${esc(x.n)}</td><td>${esc(x.cat || 'Grocery')}</td>${priceCell(x)}<td>${x.s}</td><td><span class="badge">Active</span></td>
    <td><button class="link" data-detail="${esc(x.id)}">View</button>${ed ? ` <button class="link" data-cat-edit="${esc(x.id)}">Edit</button>` : ''}</td></tr>`).join('');
  el.innerHTML = `<div class="pagehead"><div><h1>Catalogue</h1><p>Master products, barcodes, price and tax${ed ? '' : ' · view only for your role'}</p></div>
    ${ed ? `<div class="actions">${canImport() ? '<button class="btn" id="catImport">Import</button>' : ''}`+'<button class="btn primary" data-a="addProduct">＋ Add product</button></div>' : ''}</div>
    ${pendingHtml()}${S.stage ? stageHtml() : ''}
    <div class="card panel"><table class="table"><thead><tr><th>Image</th><th>Barcode</th><th>Product</th><th>Category</th><th>Price</th><th>On hand</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// ---------------- edit one product
function editDialog(id) {
  const it = all().find(x => x.id === id); if (!it) return;
  open(`Edit product · ${it.n}`, `<div class="field"><label>Barcode</label><input id="ceBar" value="${esc(it.id)}" disabled></div>
    <p>The barcode identifies the product and cannot be changed. A different barcode means a different product.</p>
    <div class="field"><label>Product name</label><input id="ceName" value="${esc(it.n)}"></div>
    <div class="field"><label>Category</label><select id="ceCat">${CATS.map(c => `<option value="${c}" ${c === (it.cat || 'Grocery') ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label>Sell price (₹)</label><input id="cePrice" value="${it.p}" inputmode="decimal" ${canPrice() ? '' : 'disabled title="Price changes need the Pricing and promotions role"'}></div>
    <div class="field"><label>Images</label><div id="ceImages">${imagesHtml(id)}</div></div>
    <div class="actions" style="flex-wrap:wrap"><label class="btn" style="cursor:pointer">Upload images<input type="file" id="ceImgFile" accept="image/jpeg,image/png,image/webp" multiple style="display:none"></label>
    <button class="btn" id="ceImgSample" type="button">Use the training sample photo</button></div>
    <p style="font-size:13px">JPG, PNG or WebP · at least 500 × 500 pixels · up to 5 MB · up to ${MAX_IMAGES} images. Use a plain white background for the main image. Grocery listings on ONDC also need ingredient and nutrition images. Image changes are saved straight away; <b>Save changes</b> is for the name, category and price.</p>`, footer('catEditSave', 'Save changes'));
  q('#ceImgFile').onchange = ev => { [...ev.target.files].forEach(f => addImageFile(id, f)); ev.target.value = ''; };
  q('#ceImgSample').onclick = () => addImageData(id, samplePhoto(it), 'training-sample.jpg', 1000, 1000);
  q('#catEditSave').onclick = () => {
    const n = q('#ceName').value.trim(), cat = q('#ceCat').value, p = Number(q('#cePrice').value);
    if (!n) return toast('Enter a product name');
    if (!(p > 0) || Math.round(p * 100) !== p * 100) return toast('Enter a price above 0, in rupees with up to 2 decimals');
    const changes = [];
    if (n !== it.n) changes.push(`name ${it.n} → ${n}`);
    if (cat !== (it.cat || 'Grocery')) changes.push(`category ${it.cat || 'Grocery'} → ${cat}`);
    if (p !== it.p) changes.push(`price ${rupees(it.p)} → ${rupees(p)}`);
    if (!changes.length) { close(); return toast('No changes to save'); }
    Object.assign(it, {n, cat, p}); S.edits[id] = {...(S.edits[id] || {}), n, cat, p};
    audit('Product updated', `${id} · ${changes.join('; ')}`); save(); persist(); close(); refresh(); toast('Product updated');
  };
}

// ---------------- import staging
const SAMPLE = 'barcode,name,category,price,stock\n8901010,Aashirvaad Select Atta 1kg,Grocery,6O,10\n8901011,Sunfeast Marie 200g,Grocery,30,24\n8901002,Heritage Milk 500ml,Dairy,28,0\n8901005,Sunflower Oil 1L,Grocery,145,0\n8901011,Sunfeast Marie 200g,Grocery,30,24\n';
function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const head = lines[0].toLowerCase().split(',').map(s => s.trim());
  const ix = k => head.indexOf(k);
  if (['barcode', 'name', 'price'].some(k => ix(k) < 0)) throw new Error('The file needs the columns barcode, name, category, price, stock');
  return lines.slice(1).map((l, i) => { const c = l.split(','); const g = k => ix(k) >= 0 ? (c[ix(k)] || '').trim() : '';
    return {row: i + 1, barcode: g('barcode'), name: g('name'), category: g('category') || 'Grocery', price: g('price'), stock: g('stock') || '0'}; });
}
function validate() {
  const st = S.stage; if (!st) return;
  const seen = {};
  for (const r of st.rows) {
    r.errors = []; r.action = 'New product';
    if (!/^\d{7,14}$/.test(r.barcode)) r.errors.push('Barcode must be 7 to 14 digits');
    if (!r.name) r.errors.push('Product name is missing');
    const p = Number(r.price);
    if (!(p > 0) || Math.round(p * 100) !== p * 100) r.errors.push('Price must be a number above 0');
    if (!CATS.includes(r.category)) r.errors.push('Unknown category');
    if (!/^\d+$/.test(String(r.stock))) r.errors.push('Opening stock must be a whole number');
    if (seen[r.barcode]) r.errors.push(`Duplicate of row ${seen[r.barcode]} in this file`); else seen[r.barcode] = r.row;
    const ex = all().find(x => x.id === r.barcode);
    if (ex) {
      if (ex.n.toLowerCase() !== r.name.toLowerCase()) r.errors.push(`Barcode already belongs to ${ex.n}`);
      else r.action = 'Update existing';
    }
  }
}
function stageHtml() {
  validate();
  const st = S.stage, bad = st.rows.filter(r => r.errors.length).length;
  const opt = v => CATS.map(c => `<option value="${c}" ${c === v ? 'selected' : ''}>${c}</option>`).join('');
  return `<div class="card panel" id="catStage"><h2>Uploaded catalogue: review before committing</h2>
    <p>File: <b>${esc(st.file)}</b> · ${st.rows.length} rows · <b>${bad ? bad + ' with problems' : 'all rows valid'}</b>. Edit any cell or delete a row. Nothing changes in the catalogue until you commit.</p>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Row</th><th>Barcode</th><th>Product name</th><th>Category</th><th>Price (₹)</th><th>Opening stock</th><th>Result</th><th></th></tr></thead><tbody>
    ${st.rows.map(r => `<tr data-stage-row="${r.row}"><td>${r.row}</td>
      <td><input data-stage="barcode" data-row="${r.row}" value="${esc(r.barcode)}" style="width:88px"></td>
      <td><input data-stage="name" data-row="${r.row}" value="${esc(r.name)}" style="width:150px"></td>
      <td><select data-stage="category" data-row="${r.row}" style="width:108px">${opt(r.category)}</select></td>
      <td><input data-stage="price" data-row="${r.row}" value="${esc(r.price)}" style="width:56px"></td>
      <td><input data-stage="stock" data-row="${r.row}" value="${esc(r.stock)}" style="width:48px"></td>
      <td style="min-width:190px">${r.errors.length ? `<span class="badge red">Fix</span> ${esc(r.errors.join('; '))}` : `<span class="badge">${esc(r.action)}</span>`}</td>
      <td><button class="link" data-stage-del="${r.row}">Delete</button></td></tr>`).join('')}</tbody></table></div>
    <p>Updates change name, category and price only. Stock for existing products changes only through receiving and adjustments.</p>
    <div class="actions"><button class="btn" id="stageDiscard">Discard upload</button><button class="btn primary" id="stageCommit" ${bad || !st.rows.length ? 'disabled style="opacity:.45;cursor:not-allowed"' : ''}>Commit ${st.rows.length} rows</button></div></div>`;
}
function importDialog() {
  open('Import catalogue', `<p>Upload a CSV file with the columns <code>barcode, name, category, price, stock</code>. The rows go to a review table first; nothing is changed until you commit.</p>
    <div class="field"><label>Catalogue file (.csv)</label><input type="file" id="catFile" accept=".csv,text/csv"></div>
    <div class="actions"><button class="btn" id="catSample">Use the training sample file</button></div>`, '<button class="btn" data-a="cancel">Cancel</button>');
  const load = (name, text) => {
    try { const rows = parseCsv(text); if (!rows.length) return toast('The file has no product rows');
      S.stage = {file: name, rows}; audit('Catalogue file uploaded', `${name} · ${rows.length} rows, not committed`); save(); close(); render(); toast(`${rows.length} rows ready for review`); }
    catch (e) { toast(e.message); }
  };
  q('#catSample').onclick = () => load('training-sample.csv', SAMPLE);
  q('#catFile').onchange = ev => { const f = ev.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => load(f.name, String(r.result)); r.readAsText(f); };
}
function commit() {
  validate();
  const st = S.stage; if (!st || st.rows.some(r => r.errors.length)) return toast('Fix every row before committing');
  let added = 0, updated = 0;
  for (const r of st.rows) {
    const ex = all().find(x => x.id === r.barcode), p = Number(r.price);
    if (ex) { Object.assign(ex, {n: r.name, cat: r.category, p}); S.edits[ex.id] = {...(S.edits[ex.id] || {}), n: r.name, cat: r.category, p}; updated++; }
    else { const it = {id: r.barcode, n: r.name, p, e: '📦', s: Number(r.stock), cat: r.category}; all().push(it); S.added.push(it); added++; }
  }
  audit('Catalogue import committed', `${st.file} · ${added} added, ${updated} updated`);
  S.stage = null; save(); persist(); refresh(); toast(`Committed: ${added} added, ${updated} updated`);
}

// ---------------- product images
const MAX_IMAGES = 6, ROLES = ['Front', 'Back', 'Ingredients', 'Nutrition', 'Other'];
const imagesOf = sku => S.images[sku] || [];
const mainImage = sku => imagesOf(sku).find(i => i.main) || null;
function imagesHtml(sku) {
  const imgs = imagesOf(sku);
  if (!imgs.length) return '<p style="margin:4px 0">No images yet.</p>';
  return `<div style="display:flex;gap:10px;flex-wrap:wrap">${imgs.map(i => `<div data-img="${i.id}" style="border:1px solid #ddd;border-radius:8px;padding:6px;width:132px;background:#fff">
    <img src="${i.data}" alt="${esc(i.role)}" style="width:118px;height:118px;object-fit:contain;display:block">
    <select data-imgrole="${sku}:${i.id}" style="width:118px;margin-top:4px">${ROLES.map(r => `<option value="${r}" ${r === i.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <div style="font-size:12px;margin-top:4px">${i.w} × ${i.h} px</div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">${i.main ? '<span class="badge">Main</span>' : `<button class="link" type="button" data-imgmain="${sku}:${i.id}">Make main</button>`}<button class="link" type="button" data-imgdel="${sku}:${i.id}">Remove</button></div></div>`).join('')}</div>`;
}
function refreshImages(sku) { const el = q('#ceImages'); if (el) el.innerHTML = imagesHtml(sku); render(); }
function addImageFile(sku, file, toPending = false) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast(`${file.name}: use a JPG, PNG or WebP image`);
  if (file.size > 5 * 1024 * 1024) return toast(`${file.name}: larger than 5 MB`);
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => addImageData(sku, String(r.result), file.name, img.naturalWidth, img.naturalHeight, toPending); img.onerror = () => toast(`${file.name}: the image could not be read`); img.src = String(r.result); };
  r.readAsDataURL(file);
}
function addImageData(sku, dataUrl, name, w, h, toPending = false) {
  if (!canEdit()) return toast('Your role cannot change product images');
  if (imagesOf(sku).length + PENDING.images.filter(i => i.sku === sku).length >= MAX_IMAGES) return toast(`A product can have at most ${MAX_IMAGES} images`);
  if (w < 500 || h < 500) return toast(`${name}: ${w} × ${h} pixels is too small; use at least 500 × 500`);
  // Resize for storage (longest side 800 px, JPEG); the original size is recorded.
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const it = all().find(x => x.id === sku), list = [...imagesOf(sku), ...PENDING.images.filter(i => i.sku === sku).map(i => i.rec)];
    const role = list.some(i => i.role === 'Front') ? 'Other' : 'Front';
    const rec = {id: 'img' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), role, data: c.toDataURL('image/jpeg', 0.82), w, h, main: !list.length, name};
    if (toPending) { PENDING.images.push({sku, rec}); render(); return toast(`Image pasted on ${it ? it.n : sku}. Choose Save changes to keep it`); }
    S.images[sku] = [...list, rec];
    if (!save()) { S.images[sku] = list; return; }
    audit('Product image added', `${sku} · ${it ? it.n : ''} · ${role}${rec.main ? ' · main image' : ''} · ${w} × ${h} px`); persist();
    refreshImages(sku); toast(`Image added to ${it ? it.n : sku}`);
  };
  img.src = dataUrl;
}
function samplePhoto(it) {
  const c = document.createElement('canvas'); c.width = c.height = 1000; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 1000, 1000);
  g.fillStyle = '#e8f1fb'; g.beginPath(); g.moveTo(330, 170); g.lineTo(670, 170); g.lineTo(720, 830); g.lineTo(280, 830); g.closePath(); g.fill();
  g.strokeStyle = '#1f5fa8'; g.lineWidth = 10; g.stroke();
  g.fillStyle = '#1f5fa8'; g.fillRect(330, 150, 340, 40);
  g.fillStyle = '#1f5fa8'; g.font = 'bold 64px Arial'; g.textAlign = 'center';
  const words = (it ? it.n : 'Product').split(' '), mid = Math.ceil(words.length / 2);
  g.fillText(words.slice(0, mid).join(' '), 500, 470); g.font = 'bold 54px Arial'; g.fillText(words.slice(mid).join(' '), 500, 550);
  g.font = '28px Arial'; g.fillStyle = '#57606a'; g.fillText('Training sample photo', 500, 900);
  return c.toDataURL('image/jpeg', 0.9);
}

// ---------------- unsaved table edits and the database
const pendingCount = () => Object.keys(PENDING.prices).length + PENDING.images.length;
function pendingList() {
  const name = sku => (all().find(x => x.id === sku) || {}).n || sku;
  return [...Object.entries(PENDING.prices).map(([sku, p]) => `${name(sku)}: price ${rupees(all().find(x => x.id === sku).p)} → ${rupees(p)}`),
    ...PENDING.images.map(i => `${name(i.sku)}: new image (${i.rec.w} × ${i.rec.h} px)`)];
}
function pendingHtml() {
  const n = pendingCount(), where = DBS.state === 'on' ? 'the database' : 'this browser (the database is not available here)';
  if (!n) return DBS.savedAt ? `<p id="catSaved" style="margin:0 0 8px;color:#1a7f37">✓ All changes saved to ${where} at ${DBS.savedAt}.</p>` : '';
  return `<div class="card panel" id="catPending" style="border:2px solid #d4a72c;background:#fffbea"><b>${n} unsaved change${n > 1 ? 's' : ''}</b>
    <p style="margin:4px 0 8px">${pendingList().map(esc).join('; ')}</p><p style="margin:0 0 8px;font-size:13px">Saving writes to ${where}.</p>
    <div class="actions"><button class="btn" id="catDiscard">Discard</button><button class="btn primary" id="catSaveAll">Save changes</button></div></div>`;
}
function saveAll() {
  const list = pendingList(); if (!list.length) return;
  for (const [sku, p] of Object.entries(PENDING.prices)) { const it = all().find(x => x.id === sku); if (!it) continue; it.p = p; S.edits[sku] = {...(S.edits[sku] || {}), n: it.n, cat: it.cat || 'Grocery', p}; }
  for (const {sku, rec} of PENDING.images) { const cur = imagesOf(sku); if (cur.some(i => i.main)) rec.main = false; else rec.main = true; S.images[sku] = [...cur, rec]; }
  PENDING = {prices: {}, images: []};
  if (!save()) return;
  audit('Catalogue changes saved', list.join('; '));
  persist().then(ok => { DBS.savedAt = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}); refresh(); toast(ok ? 'Saved to the database' : 'Saved in this browser'); });
}
async function persist() {
  if (DBS.state !== 'on') return false;
  try {
    const base = `data/users/${DBS.uid}/catalogue`;
    await DBS.db.doc(base).set({edits: S.edits, added: S.added, savedAt: Date.now()});
    const col = DBS.db.collection(base + '/images'), snap = await col.get();
    const want = new Map(Object.entries(S.images).flatMap(([sku, list]) => list.map(i => [i.id, {sku, ...i}])));
    for (const d of snap.docs || []) if (!want.has(d.id)) await col.doc(d.id).delete();
    const have = new Set((snap.docs || []).map(d => d.id));
    for (const [id, rec] of want) { const old = (snap.docs || []).find(d => d.id === id); if (!have.has(id) || JSON.stringify(old.data()) !== JSON.stringify(rec)) await col.doc(id).set(rec); }
    return true;
  } catch (e) { toast(e && e.code === 'quota_exceeded' ? 'The database is full. Remove some images and save again' : 'Could not reach the database; the changes are kept in this browser'); return false; }
}
async function connectDb() {
  try {
    if (!window.claude || !window.claude.use) { DBS.state = 'off'; return render(); }
    const db = await window.claude.use('db'), user = await window.claude.use('user');
    const uid = user ? await user.id() : null;
    if (!db || !uid) { DBS.state = 'off'; return render(); }
    Object.assign(DBS, {db, uid, state: 'on'});
    const base = `data/users/${uid}/catalogue`, doc = await db.doc(base).get();
    if (doc.exists) {
      const d = doc.data(); S.edits = d.edits || {}; S.added = d.added || S.added;
      const imgs = await db.collection(base + '/images').get(); S.images = {};
      for (const x of imgs.docs || []) { const r = {...x.data()}; const sku = r.sku; delete r.sku; (S.images[sku] = S.images[sku] || []).push(r); }
      save(); reapply(); refresh();
    } else if (Object.keys(S.edits).length || Object.keys(S.images).length) { await persist(); }
  } catch (e) { DBS.state = 'off'; }
  render();
}
function startPriceEdit(td) {
  const sku = td.dataset.pricecell, it = all().find(x => x.id === sku); if (!it) return;
  if (!canPrice()) return toast('Price changes need the Pricing and promotions role');
  const cur = PENDING.prices[sku] ?? it.p;
  td.innerHTML = `<input data-priceinput="${esc(sku)}" value="${cur}" inputmode="decimal" style="width:90px" aria-label="New price for ${esc(it.n)}">`;
  const inp = td.querySelector('input'); inp.focus(); inp.select();
  let done = false;
  const finish = commit => {
    if (done) return; done = true;
    if (commit) {
      const v = Number(String(inp.value).replace(/[₹,\s]/g, ''));
      if (!(v > 0) || Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) { toast('Enter a price above 0, in rupees with up to 2 decimals'); return render(); }
      if (v === it.p) delete PENDING.prices[sku]; else PENDING.prices[sku] = Math.round(v * 100) / 100;
    }
    render();
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
}
let pasteTarget = null;
document.addEventListener('paste', e => {
  const cell = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-imgcell]') || pasteTarget;
  if (!cell || !document.contains(cell)) return;
  if (!canEdit()) return toast('Your role cannot change product images');
  const file = [...(e.clipboardData?.items || [])].find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
  if (!file) return toast('The clipboard has no image. Copy an image first');
  e.preventDefault(); addImageFile(cell.dataset.imgcell, file, true);
});
window.addEventListener('beforeunload', e => { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });

// ---------------- events
document.addEventListener('click', e => {
  if (e.target.closest('#catalogue [data-a="import"], #catImport')) { e.preventDefault(); e.stopImmediatePropagation(); if (!canImport()) return toast('Your role cannot import the catalogue'); return importDialog(); }
  const ed = e.target.closest('[data-cat-edit]');
  if (ed) { if (!canEdit()) return toast('Your role cannot edit products'); return editDialog(ed.dataset.catEdit); }
  const pc = e.target.closest('[data-pricecell]');
  if (pc && !e.target.closest('input')) return startPriceEdit(pc);
  const ic = e.target.closest('[data-imgcell]');
  if (ic) { if (!canEdit()) return toast('Your role cannot change product images'); pasteTarget = ic; ic.focus(); document.querySelectorAll('[data-imgcell]').forEach(c => c.style.outline = ''); ic.style.outline = '3px solid #0969da'; return toast('Now paste an image (Ctrl+V or ⌘V)'); }
  if (e.target.closest('#catSaveAll')) return saveAll();
  if (e.target.closest('#catDiscard')) { PENDING = {prices: {}, images: []}; render(); return toast('Unsaved changes discarded'); }
  const im = e.target.closest('[data-imgmain]'), idel = e.target.closest('[data-imgdel]');
  if (im || idel) {
    if (!canEdit()) return toast('Your role cannot change product images');
    const [sku, id] = (im || idel).dataset[im ? 'imgmain' : 'imgdel'].split(':'); const list = imagesOf(sku), rec = list.find(i => i.id === id); if (!rec) return;
    if (im) { list.forEach(i => { i.main = i.id === id; }); audit('Main product image changed', `${sku} · ${rec.role}`); }
    else { S.images[sku] = list.filter(i => i.id !== id); if (rec.main && S.images[sku][0]) S.images[sku][0].main = true; audit('Product image removed', `${sku} · ${rec.role}`); }
    save(); persist(); return refreshImages(sku);
  }
  const del = e.target.closest('[data-stage-del]');
  if (del && S.stage) { if (!canEdit()) return; const n = +del.dataset.stageDel; S.stage.rows = S.stage.rows.filter(r => r.row !== n); save(); return render(); }
  if (e.target.closest('#stageDiscard')) { if (!canEdit()) return; audit('Catalogue upload discarded', S.stage ? S.stage.file : ''); S.stage = null; save(); render(); return toast('Upload discarded; the catalogue is unchanged'); }
  if (e.target.closest('#stageCommit')) { if (!canEdit()) return toast('Your role cannot commit the catalogue'); return commit(); }
}, true);
document.addEventListener('change', e => {
  const ir = e.target.closest('[data-imgrole]');
  if (ir) { if (!canEdit()) return; const [sku, id] = ir.dataset.imgrole.split(':'); const rec = imagesOf(sku).find(i => i.id === id); if (rec) { const before = rec.role; rec.role = ir.value; save(); audit('Product image type changed', `${sku} · ${before} → ${rec.role}`); } return; }
  const f = e.target.closest('[data-stage]'); if (!f || !S.stage || !canEdit()) return;
  const r = S.stage.rows.find(x => x.row === +f.dataset.row); if (!r) return;
  r[f.dataset.stage] = f.value.trim(); save(); render();
}, true);

function refresh() { try { screens(); } catch (e) { render(); } }
// The platform redraws #catalogue inside screens(); redraw ours right after it.
try { const base = screens; screens = function () { const r = base.apply(this, arguments); try { render(); } catch (e) {} return r; }; } catch (e) {}
reapply(); render();
let lastRole = role();
setInterval(() => { const pv = (window.AFMPolicy ? AFMPolicy.state().published.version : 0) + ':' + role(); if (pv !== lastRole) { lastRole = pv; render(); return; } if (q('#catalogue') && ![...document.querySelectorAll('#catalogue th')].some(th => th.textContent === 'On hand')) render(); }, 400);
window.AFMCatalogue = {state: () => S, reset: () => { S = {edits: {}, added: [], stage: null, images: {}}; PENDING = {prices: {}, images: []}; save(); }, render, imagesOf, mainImage, pending: () => PENDING, db: () => DBS.state, persist};
connectDb();
})();

