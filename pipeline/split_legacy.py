"""One-time migration: split the legacy single-file page into the modular source tree.

Kept for provenance only. You do not need to run it again: the files under src/ are now the source of truth.

    python pipeline/split_legacy.py <legacy work folder>
"""
import base64, json, os, re, sys, importlib.util
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work'
sys.path.insert(0, os.path.join(W, 'tamil'))

# Legacy script index -> (module id, kind). Kinds: platform, training, i18n (Tamil screens).
NAMES = [
    ('lang-default', 'platform'), ('core-pos', 'platform'), ('channel-cart-legacy', 'platform'), ('channel-screens-strip', 'platform'),
    ('catalogue-pim', 'platform'), ('orders-nav', 'platform'), ('product-translations', 'platform'), ('orders-view', 'platform'),
    ('orders-status-legacy', 'platform'), ('orders-status', 'platform'), ('delivery-nav', 'platform'), ('logistics-nav', 'platform'),
    ('order-exceptions', 'platform'), ('logistics-workspace', 'platform'), ('operations-state', 'platform'), ('functional-closure', 'platform'),
    ('oms', 'platform'), ('persona-shell', 'platform'), ('stock', 'platform'), ('catalogue-import-methods', 'platform'),
    ('pilot-gap-closure', 'platform'), ('pilot-promotion', 'platform'), ('round2-closure', 'platform'), ('assurance-closure', 'platform'),
    ('defect-closure', 'platform'), ('business-processes', 'platform'),
    ('practice-environment', 'training'), ('voice-coach', 'training'), ('teacher-curriculum', 'training'), ('expert-coaching', 'training'),
    ('action-lab', 'training'), ('action-map', 'training'), ('training-exports', 'training'), ('tamil-teacher', 'training'),
    ('tamil-voice-coach', 'training'), ('apply-language', 'platform'), ('audio-fallback', 'training'), ('packaged-narration', 'training'),
    ('context-curriculum', 'training'), ('orientation-recordings', 'training'), ('ta-screens', 'i18n'), ('movable-windows', 'training'),
    'SPLIT42', 'SPLIT43', ('process-guidance', 'training'), ('action-explanations', 'training'),
    ('channels', 'platform'), ('catalogue', 'platform'), ('orders-rows', 'platform'), ('access-policy', 'platform'),
    'AUDIO', 'GUIDED',
]

def load(path):
    spec = importlib.util.spec_from_file_location(os.path.basename(path)[:-3], path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

def main():
    bb = load(os.path.join(W, 'build_both.py'))
    page = bb.fix_english_notes(bb.merge_tamil_lessons(open(os.path.join(W, 'base.html'), encoding='utf-8').read()))
    blocks = list(re.finditer(r'<script>(.*?)</script>', page, re.S))
    assert len(blocks) == len(NAMES), (len(blocks), len(NAMES))
    manifest, out, last = [], [], 0
    def module(mid, kind, body, note=''):
        path = f'src/modules/{kind}/{mid}.js'
        open(os.path.join(ROOT, path), 'w', encoding='utf-8').write(body)
        manifest.append({'id': mid, 'kind': kind, 'file': path, **({'note': note} if note else {})})
        return f'<!--@module:{mid}-->'
    for n, m in enumerate(blocks):
        out.append(page[last:m.start()]); last = m.end(); body = m.group(1); spec = NAMES[n]
        if spec == 'SPLIT42':
            i = body.index('const TA_COACH_EXACT')
            out.append(module('guided-workflow', 'training', body[:i]))
            out.append(module('ta-coach', 'i18n', body[i:], 'Tamil translation of the original screens (word level)'))
        elif spec == 'SPLIT43':
            i = body.index('Object.assign(TA_COACH_EXACT,')
            out.append(module('business-sequence', 'training', body[:i]))
            out.append(module('ta-coach-copy', 'i18n', body[i:], 'More Tamil for the original screens'))
        elif spec == 'AUDIO':
            audio, end = json.JSONDecoder().raw_decode(body[body.index('{'):])
            links = json.JSONDecoder().raw_decode(body[body.index('window.AFM_PAGE_LINKS=') + 22:])[0]
            json.dump(links, open(os.path.join(ROOT, 'config', 'links.json'), 'w'), indent=2)
            save_audio('en', audio)
            out.append('<!--@slot:addons-before-guided--><!--@generated:narration-->')
        elif spec == 'GUIDED':
            i = body.index('const TA = ') + len('const TA = '); TA, j = json.JSONDecoder().raw_decode(body[i:])
            json.dump(TA, open(os.path.join(ROOT, 'src/i18n/ta/lessons.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            out.append(module('guided-training', 'training', body[:i] + '/*@json:ta-lessons*/{}' + body[i + j:], 'Guided lessons engine and English course text'))
        else:
            out.append(module(spec[0], spec[1], body))
    out.append(page[last:])
    shell = ''.join(out).replace('</body>', '<!--@slot:addons-end-->\n</body>', 1)
    shell = shell.replace('<!--@module:lang-default-->', '<!--@generated:flags--><!--@module:lang-default-->', 1)
    open(os.path.join(ROOT, 'src/shell/index.html'), 'w', encoding='utf-8').write(shell)
    # English clips added after the legacy page (back-office course)
    extra = open(os.path.join(W, 'afm-courses-audio.js'), encoding='utf-8').read()
    for mm in re.finditer(r'Object\.assign\(A,', extra):
        save_audio('en', json.JSONDecoder().raw_decode(extra[mm.end():])[0])
    # Tamil clips: legacy edition + new recordings
    for name in ('ta_clips_old.json', 'ta_clips_new.json'):
        save_audio('ta', {k[3:]: v for k, v in json.load(open(os.path.join(W, 'tamil', name))).items()})
    json.dump(manifest, open(os.path.join(ROOT, 'config', 'legacy_modules.json'), 'w'), indent=1)
    print(f'{len(manifest)} modules, shell {len(shell) // 1024} KB')

def save_audio(lang, clips):
    for k, v in clips.items():
        open(os.path.join(ROOT, 'src/audio', lang, k + '.mp3'), 'wb').write(base64.b64decode(v.split(',', 1)[1]))

if __name__ == '__main__':
    main()
