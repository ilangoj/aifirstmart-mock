"""Step: check the Tamil screen dictionary and lesson text.

    python afm.py i18n check            # tokens, duplicates, empty values, lesson structure
    python afm.py i18n find "Refund"    # look up entries whose English or Tamil contains a text
    python afm.py i18n add "English text" "தமிழ் உரை"   # add or change one entry (exact or template, chosen by tokens)

The dictionary is src/i18n/ta/ui.json; lesson text is src/i18n/ta/lessons.json. Both are plain JSON you can
also edit by hand. The build reads them directly; no generation step is needed.
"""
import json, re
from pipeline.common import ROOT

UI = ROOT / 'src' / 'i18n' / 'ta' / 'ui.json'
LESSONS = ROOT / 'src' / 'i18n' / 'ta' / 'lessons.json'
TOKEN = re.compile(r'%p|%c|₹#|§|@|#')


def _load():
    return json.loads(UI.read_text(encoding='utf-8'))


def _save(ui):
    for k in ('exact', 'templates', 'parts', 'attributes'):
        ui[k] = dict(sorted(ui[k].items()))
    UI.write_text(json.dumps(ui, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')


def check():
    ui = _load(); problems = []
    for k, v in ui['exact'].items():
        if not v.strip(): problems.append(f'exact "{k}": empty Tamil')
        if TOKEN.search(k): problems.append(f'exact "{k}": has tokens, belongs in templates')
    for k, v in ui['templates'].items():
        ek = TOKEN.findall(k); tv = re.findall(r'\{\d\}', v)
        tk = TOKEN.findall(re.sub(r'\{\d\}', '', v))
        if not ek: problems.append(f'template "{k}": no tokens, belongs in exact')
        if tv:
            if max(int(x[1]) for x in tv) > len(ek): problems.append(f'template "{k}": refers to a token that does not exist')
        elif sorted(tk) != sorted(ek) and len(tk) > len(ek):
            problems.append(f'template "{k}": Tamil has more tokens than English ({tk} vs {ek})')
    les = json.loads(LESSONS.read_text(encoding='utf-8'))
    for c, course in les['courses'].items():
        for i, l in enumerate(course['lessons']):
            if not l.get('title'): problems.append(f'lesson {c}-{i}: no Tamil title')
            for qid, q in l.get('q', {}).items():
                if not (isinstance(q, list) and len(q) == 3 and isinstance(q[1], list)): problems.append(f'lesson {c}-{i} question {qid}: expected [question, [options], why]')
    n = {k: len(ui[k]) for k in ('exact', 'templates', 'parts', 'attributes')}
    print(f'Tamil dictionary: {n}; lessons: ' + ', '.join(f'{c} {len(v["lessons"])}' for c, v in les['courses'].items()))
    for p in problems: print('  problem:', p)
    print('OK' if not problems else f'{len(problems)} problem(s)')
    return 1 if problems else 0


def find(text):
    ui = _load(); t = text.lower()
    for sec in ('exact', 'templates', 'parts', 'attributes'):
        for k, v in ui[sec].items():
            if t in k.lower() or t in v.lower(): print(f'[{sec}] {k}  →  {v}')


def add(en, ta):
    ui = _load(); sec = 'templates' if TOKEN.search(en) else 'exact'
    old = ui[sec].get(en); ui[sec][en] = ta; _save(ui)
    print(f'{"changed" if old else "added"} [{sec}] {en} → {ta}' + (f'  (was: {old})' if old else ''))
