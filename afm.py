"""AIFirstMart mock: one command line for every step. Each step can run on its own.

    python afm.py modules                                   list modules, what they do and which editions use them
    python afm.py build [--edition training|platform|all] [--lang en|ta|all]
    python afm.py test  [--module ID] [--test NAME] [--edition ...] [--lang ...] [--build]
    python afm.py i18n  check | find TEXT | add ENGLISH TAMIL
    python afm.py narrate status | record --lang en|ta (--clip ID[,ID] | --missing)
    python afm.py scan  [--edition ...]                      English left on Tamil pages (report)
    python afm.py serve [--edition ...] [--lang ...]         open a built page in the browser
    python afm.py package [--name NAME]                      zip the project (sources, not dist/)
    python afm.py deploy --list | --target NAME [--set k=v] [--dry-run] [--yes] [--out DIR]
    python afm.py verify --url URL                           check a running copy: health, API, every page

See STANDARD.md for the rules and a walk-through of every step.
"""
import argparse, sys
from pipeline.common import EDITIONS, LANGS, expand, manifest, included


def cmd_modules(a):
    cfg = manifest()
    print(f'{"module":28s} {"kind":13s} {"editions":18s} description')
    for m in cfg['modules'] + cfg['addons']:
        eds = ','.join(e for e in EDITIONS if included(m, e))
        print(f'{m["id"]:28s} {m["kind"]:13s} {eds:18s} {m["description"][:90]}')


def cmd_build(a):
    from pipeline.assemble import build
    for e in expand(a.edition, EDITIONS):
        for l in expand(a.lang, LANGS):
            build(e, l)


def cmd_test(a):
    from pipeline.testrun import run
    return run(module=a.module, test=a.test, editions=expand(a.edition, EDITIONS), langs=expand(a.lang, LANGS), rebuild=a.build)


def cmd_i18n(a):
    from pipeline import i18n
    if a.action == 'check': return i18n.check()
    if a.action == 'find': return i18n.find(' '.join(a.args))
    if a.action == 'add':
        if len(a.args) != 2: sys.exit('Usage: python afm.py i18n add "English text" "Tamil text"')
        return i18n.add(*a.args)


def cmd_narrate(a):
    from pipeline import narrate
    if a.action == 'status': return narrate.status()
    return narrate.record(a.lang, clip=a.clip, missing=a.missing)


def cmd_scan(a):
    from pipeline.scan import scan
    for e in expand(a.edition, EDITIONS): scan(e)


def cmd_serve(a):
    from pipeline.serve import serve
    serve(a.edition, a.lang, a.port)


def cmd_package(a):
    from pipeline.package import package
    package(a.name)


def cmd_deploy(a):
    from pipeline import deploy
    if a.list or not a.target:
        return deploy.list_targets()
    return deploy.deploy(a.target, a.set, dry_run=a.dry_run, yes=a.yes, out=a.out)


def cmd_verify(a):
    from pipeline.verify import verify
    return verify(a.url)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    s = p.add_subparsers(dest='cmd', required=True)
    s.add_parser('modules').set_defaults(f=cmd_modules)
    b = s.add_parser('build'); b.add_argument('--edition', default='all'); b.add_argument('--lang', default='all'); b.set_defaults(f=cmd_build)
    t = s.add_parser('test'); t.add_argument('--module'); t.add_argument('--test'); t.add_argument('--edition', default='all'); t.add_argument('--lang', default='all')
    t.add_argument('--build', action='store_true', help='rebuild the pages first'); t.set_defaults(f=cmd_test)
    i = s.add_parser('i18n'); i.add_argument('action', choices=['check', 'find', 'add']); i.add_argument('args', nargs='*'); i.set_defaults(f=cmd_i18n)
    n = s.add_parser('narrate'); n.add_argument('action', choices=['status', 'record']); n.add_argument('--lang', choices=LANGS, default='ta')
    n.add_argument('--clip'); n.add_argument('--missing', action='store_true'); n.set_defaults(f=cmd_narrate)
    c = s.add_parser('scan'); c.add_argument('--edition', default='all'); c.set_defaults(f=cmd_scan)
    v = s.add_parser('serve'); v.add_argument('--edition', default='platform', choices=EDITIONS); v.add_argument('--lang', default='en', choices=LANGS)
    v.add_argument('--port', type=int, default=8000); v.set_defaults(f=cmd_serve)
    k = s.add_parser('package'); k.add_argument('--name', default='aifirstmart-mock'); k.set_defaults(f=cmd_package)
    d = s.add_parser('deploy'); d.add_argument('--target'); d.add_argument('--list', action='store_true')
    d.add_argument('--set', action='append', metavar='NAME=VALUE', help='fill a {placeholder}; repeatable')
    d.add_argument('--dry-run', action='store_true', help='show the commands only'); d.add_argument('--yes', action='store_true', help='do not ask before running')
    d.add_argument('--out', help='output folder for the static target'); d.set_defaults(f=cmd_deploy)
    r = s.add_parser('verify'); r.add_argument('--url', required=True); r.set_defaults(f=cmd_verify)
    a = p.parse_args(argv)
    return a.f(a) or 0


if __name__ == '__main__':
    sys.exit(main())
