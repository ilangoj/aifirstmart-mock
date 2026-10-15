"""Step: run browser tests, all or only those covering one module (a full run adds the backend and server pytest suites).

    python afm.py test                                  # everything (+ backend pytest)
    python afm.py test --module phase2                  # only tests that cover phase2
    python afm.py test --test t_plans --edition platform
    python afm.py test --module catalogue --build       # rebuild pages first

Each test checks the page(s) listed for it in tests/registry.json, narrowed by --edition/--lang.
Results: tests/results/<test>--<edition>-<lang>.json; screenshots in tests/results/screenshots/.
"""
import json, os, subprocess, sys
from pipeline.common import ROOT, out_dir


def registry():
    return json.loads((ROOT / 'tests' / 'registry.json').read_text())['tests']


def run(module=None, test=None, editions=None, langs=None, rebuild=False):
    reg = registry(); chosen = []
    for name, t in reg.items():
        if test and name != test: continue
        if module and module not in t['modules']: continue
        for page in t['pages']:
            e, l = page.split('/')
            if (editions and e not in editions) or (langs and l not in langs and name != 't_platform'): continue
            chosen.append((name, e, l))
    if not chosen:
        raise SystemExit('No test matches. See tests/registry.json, or: python afm.py modules')
    if rebuild:
        from pipeline.assemble import build
        for e, l in sorted({(e, l) for _, e, l in chosen} | ({('platform', 'ta')} if any(n == 't_platform' for n, _, _ in chosen) else set())):
            build(e, l)
    total = failed = 0
    for name, e, l in chosen:
        page = out_dir(e, l) / 'index.html'
        if not page.exists():
            raise SystemExit(f'{page} is missing. Build it: python afm.py build --edition {e} --lang {l}')
        env = dict(os.environ, AFM_PAGE=str(page), AFM_TEST=name, AFM_RESULT=str(ROOT / 'tests' / 'results' / f'{name}--{e}-{l}.json'))
        p = subprocess.run([sys.executable, str(ROOT / 'tests' / 'ui' / f'{name}.py')], cwd=ROOT, env=env, capture_output=True, text=True, timeout=900)
        lines = (p.stdout + p.stderr).splitlines()
        ok = sum(x.startswith('PASS') for x in lines); bad = [x for x in lines if x.startswith('FAIL')]
        crash = p.returncode != 0 and not bad
        total += ok + len(bad) + crash; failed += len(bad) + crash
        print(f'{name:13s} {e}/{l}  {ok:3d} passed  {len(bad)} failed' + ('  CRASHED: ' + (lines[-1] if lines else '') if crash else ''))
        for x in bad: print('    ', x[:220])
    if not module and not test:
        p = subprocess.run([sys.executable, '-m', 'pytest', '-q'], cwd=ROOT / 'backend', capture_output=True, text=True)
        print('backend      ', (p.stdout.strip().splitlines() or ['no output'])[-1]); failed += p.returncode != 0
        p = subprocess.run([sys.executable, '-m', 'pytest', '-q', 'tests/server'], cwd=ROOT, capture_output=True, text=True)
        print('server       ', (p.stdout.strip().splitlines() or ['no output'])[-1]); failed += p.returncode != 0
    print(f'\n{total - failed if total else 0}/{total} browser checks passed')
    return 1 if failed else 0
