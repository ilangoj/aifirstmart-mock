"""Shared paths and manifest access for every pipeline step."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config' / 'modules.json'
DIST = ROOT / 'dist'
EDITIONS = ('training', 'platform')
LANGS = ('en', 'ta')


def manifest():
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def all_modules():
    """Every module and add-on in the manifest, as one list of dicts."""
    m = manifest()
    return m['modules'] + m['addons']


def module(mid):
    for x in all_modules():
        if x['id'] == mid:
            return x
    raise SystemExit(f'Unknown module "{mid}". See: python afm.py modules')


def module_source(x):
    """Source text of a module. A module with "dir" is several part files joined in name order (one scope)."""
    if 'dir' in x:
        d = ROOT / x['dir']
        return ''.join(p.read_text(encoding='utf-8') for p in sorted(d.glob('*.js')))
    return read(x['file'])


def included(x, edition):
    return x['kind'] in manifest()['editions'][edition]['kinds']


def out_dir(edition, lang):
    return DIST / edition / lang


def expand(value, choices):
    """'all' or a comma list -> tuple of names, validated."""
    if value in (None, 'all'):
        return choices
    names = tuple(v.strip() for v in value.split(','))
    bad = [n for n in names if n not in choices]
    if bad:
        raise SystemExit(f'Unknown {bad}; choose from {", ".join(choices)} or all')
    return names


def links():
    p = ROOT / 'config' / 'links.json'
    return json.loads(p.read_text()) if p.exists() else {}
