// ================================================================ training records and lesson search
const TR_KEY = 'afm-guided-training-v1';
function myProgress() {
  let mem = {}; try { mem = JSON.parse(localStorage.getItem(TR_KEY) || '{}'); } catch (e) {}
  const C = window.AFMGuidedTraining?.courses || {};
  return Object.entries(C).map(([k, c]) => ({k, title: c.title, done: (mem.done?.[k] || []).length, total: c.lessons.length}));
}
let team = null, DB = null, UID = null, lastPushed = '', search = '';
async function connectRecords() {
  try {
    if (!window.claude?.use || window.AFM_NO_TRAINING) return;
    const db = await window.claude.use('db'), user = await window.claude.use('user');
    UID = user ? await user.id() : null; if (!db || !UID) return; DB = db;
    db.collection('training').onSnapshot(snap => { team = (snap.docs || []).map(d => ({id: d.id, ...d.data()})); renderRecords(); }, () => { team = 'denied'; renderRecords(); });
    pushProgress();
  } catch (e) {}
}
async function pushProgress() {
  if (window.AFM_NO_TRAINING || !DB || !UID) return;
  const p = myProgress(), sig = JSON.stringify(p.map(x => x.done));
  if (sig === lastPushed) return; lastPushed = sig;
  try { await DB.doc('training/' + UID).set({courses: p, updated: Date.now(), role: persona()}); } catch (e) {}
}
function lessonIndex() {
  const C = window.AFMGuidedTraining?.courses || {}, out = [];
  for (const [k, c] of Object.entries(C)) c.lessons.forEach((l, i) => out.push({k, i, course: c.title, title: l.title, text: `${l.title} ${l.situation || ''} ${l.why || ''}`.toLowerCase()}));
  return out;
}
function openLesson(k, i) {
  try { const mem = JSON.parse(localStorage.getItem(TR_KEY) || '{}'); Object.assign(mem, {course: k, lesson: i, step: 0, view: 'intro'}); localStorage.setItem(TR_KEY, JSON.stringify(mem)); } catch (e) {}
  location.reload();
}
function renderRecords() {
  const el = q('#records'); if (!el) return;
  const mine = myProgress(), all = mine.reduce((a, x) => a + x.total, 0), done = mine.reduce((a, x) => a + x.done, 0);
  const hits = search.trim().length >= 2 ? lessonIndex().filter(x => search.toLowerCase().split(/\s+/).every(w => x.text.includes(w))).slice(0, 12) : [];
  const focus = document.activeElement?.id === 'lessonSearch', caret = focus ? document.activeElement.selectionStart : null;
  el.innerHTML = `<div class="pagehead"><div><h1>Training records</h1><p>Find a lesson, see your progress and, for managers, the team’s progress.</p></div><div class="actions"><button class="btn" data-export="training">Export CSV</button></div></div>
    <div class="card panel"><h2>Find a lesson</h2><div class="field"><label for="lessonSearch">Search by topic, for example “refund”, “barcode” or “WhatsApp”</label><input id="lessonSearch" type="search" value="${esc(search)}" autocomplete="off"></div>
    ${hits.length ? `<ul style="list-style:none;padding:0">${hits.map(h => `<li style="padding:6px 0;border-bottom:1px solid #eee"><b>${esc(h.title)}</b><br><small>${esc(h.course)} · lesson ${h.i + 1}</small> <button class="link" data-open-lesson="${h.k}:${h.i}">Open lesson →</button></li>`).join('')}</ul>` : search.trim().length >= 2 ? '<p>No lesson matches. Try another word.</p>' : ''}</div>
    <div class="card panel"><h2>My progress · ${done} of ${all} lessons</h2><table class="table"><thead><tr><th>Course</th><th>Completed</th><th style="width:40%">Progress</th></tr></thead><tbody>
    ${mine.map(x => `<tr><td>${esc(x.title)}</td><td>${x.done} of ${x.total}</td><td><div role="progressbar" aria-valuenow="${x.done}" aria-valuemin="0" aria-valuemax="${x.total}" aria-label="${esc(x.title)}" style="background:#e6e6e6;border-radius:6px;height:10px"><div style="width:${x.total ? Math.round(100 * x.done / x.total) : 0}%;background:#1a7f37;height:10px;border-radius:6px"></div></div></td></tr>`).join('')}</tbody></table></div>
    <div class="card panel" id="teamRecords"><h2>Team progress</h2>${DB && team === 'denied' ? '<p>Team progress is visible to the owner and the training manager. Your own progress is saved for them to see.</p>' : DB ? (team && team.length ? `<table class="table"><thead><tr><th>Trainee</th><th>Role practised</th><th>Lessons completed</th><th>Last activity</th></tr></thead><tbody>${team.map(t => { const d = (t.courses || []).reduce((a, x) => a + x.done, 0), n = (t.courses || []).reduce((a, x) => a + x.total, 0);
      return `<tr><td data-uid="${esc(t.id)}">${t.id === UID ? 'You' : 'Trainee ' + esc(t.id.slice(-4))}</td><td>${esc(t.role || '')}</td><td>${d} of ${n}</td><td>${t.updated ? new Date(t.updated).toLocaleDateString('en-IN') : '—'}</td></tr>`; }).join('')}</tbody></table>` : '<p>No team records yet. Records appear as trainees complete lessons.</p>')
      : '<p>Team records are kept in the shared database on the published page. Here you see your own progress only.</p>'}</div>`;
  if (focus) { const s = q('#lessonSearch'); s.focus(); try { s.setSelectionRange(caret, caret); } catch (e) {} }
  if (DB) resolveNames();
}
async function resolveNames() {
  try { const user = await window.claude.use('user'); const ids = qa('#teamRecords [data-uid]').map(td => td.dataset.uid).filter(id => id !== UID); if (!ids.length) return;
    const ps = await user.profiles(ids); for (const td of qa('#teamRecords [data-uid]')) { const p = ps[td.dataset.uid]; if (p && p.name) td.textContent = p.name; } } catch (e) {}
}

