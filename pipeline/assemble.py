"""Step: assemble pages from the shell, styles, modules, translations and narration.

    python afm.py build                          # all four pages
    python afm.py build --edition platform --lang ta

Output: dist/<edition>/<lang>/index.html (+ audio-ta-*.js for the Tamil training page).
Nothing under src/ is changed. Assembly is deterministic: the same sources give the same bytes.
"""
import base64, json, re
from pipeline.common import ROOT, manifest, read, module_source, included, out_dir, links

SCRIPT = '<script>{}</script>'


def _script(body):
    return SCRIPT.format(body.replace('</script', '<\\/script'))


def narration(lang):
    """All clips for a language as {clip id: data URL}, from src/audio/<lang>/*.mp3."""
    prefix = '' if lang == 'en' else f'{lang}:'
    clips = {}
    for f in sorted((ROOT / 'src' / 'audio' / lang).glob('*.mp3')):
        clips[prefix + f.stem] = 'data:audio/mpeg;base64,' + base64.b64encode(f.read_bytes()).decode()
    return clips


def ta_ui_data():
    ui = json.loads(read('src/i18n/ta/ui.json'))
    data = {'exact': ui['exact'], 'tmpl': ui['templates'], 'parts': ui['parts'], 'names': ui['names'], 'attrs': ui['attributes']}
    return 'window.AFM_TA_UI=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'


def build(edition, lang):
    cfg = manifest(); ed = cfg['editions'][edition]
    page = read('src/shell/index.html')
    files = {}
    # styles
    for s in cfg['styles']:
        page = page.replace(f'<!--@style:{s["id"]}-->', '<style>' + read(s['file']) + '</style>', 1)
    # flags, title, default language
    flags = dict(ed.get('flags', {}), AFM_DEFAULT_LANG=lang, AFM_EDITION=edition)
    page = page.replace('<!--@generated:flags-->', _script(''.join(f'window.{k}={json.dumps(v)};' for k, v in flags.items())), 1)
    page = page.replace('<!--@generated:title-->', ed['title'][lang], 1)
    # legacy-position modules
    for m in cfg['modules']:
        body = module_source(m) if included(m, edition) else None
        if body is not None and m['id'] == 'guided-training':
            body = body.replace('/*@json:ta-lessons*/{}', json.dumps(json.loads(read('src/i18n/ta/lessons.json')), ensure_ascii=False), 1)
        page = page.replace(f'<!--@module:{m["id"]}-->', _script(body) + '\n' if body is not None else '', 1)
    # add-ons, by slot, in manifest order
    for slot in ('addons-before-guided', 'addons-end'):
        parts = []
        for a in cfg['addons']:
            if a['slot'] != slot or not included(a, edition):
                continue
            body = ta_ui_data() if a.get('generated') == 'ta-ui-data' else module_source(a)
            parts.append('<script>\n' + body.replace('</script', '<\\/script') + '\n</script>\n')
        page = page.replace(f'<!--@slot:{slot}-->', ''.join(parts), 1)
    # narration
    audio = ''
    if ed.get('narration'):
        clips = narration(lang)
        page_links = 'window.AFM_PAGE_LINKS=' + json.dumps(links()) + ';\n'
        if lang == 'en':
            audio = _script('\nwindow.AFM_TRAINING_AUDIO=' + json.dumps(clips) + ';\n' + page_links)
        else:
            keys = sorted(clips); n = cfg['languages'][lang].get('narration_files', 2); size = -(-len(keys) // n); tags = ''
            for i in range(n):
                name = f'audio-{lang}-{i + 1}.js'
                files[name] = '(()=>{const A=window.AFM_TRAINING_AUDIO=window.AFM_TRAINING_AUDIO||{};Object.assign(A,' + json.dumps({k: clips[k] for k in keys[i * size:(i + 1) * size]}) + ');})();\n'
                tags += f'<script src="{name}"></script>\n'
            audio = tags + _script('\nwindow.AFM_TRAINING_AUDIO=window.AFM_TRAINING_AUDIO||{};\n' + page_links)
    page = page.replace('<!--@generated:narration-->', audio, 1)
    left = re.findall(r'<!--@[a-z]+:[\w-]+-->', page)
    if left:
        raise SystemExit(f'Unfilled placeholders in the shell: {left[:5]}')
    out = out_dir(edition, lang); out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('audio-*.js'):
        old.unlink()
    (out / 'index.html').write_text(page, encoding='utf-8')
    for name, body in files.items():
        (out / name).write_text(body, encoding='utf-8')
    size = sum(len(b.encode()) for b in files.values())
    print(f'built {edition}/{lang}: index.html {len(page.encode()) / 1e6:.2f} MB' + (f' + narration files {size / 1e6:.1f} MB' if files else ''))
    if len(page.encode()) > 16e6:
        print('  warning: page is over the 16 MB hosting limit')
    return out / 'index.html'
