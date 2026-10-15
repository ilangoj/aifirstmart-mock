"""Which page a test checks and where it writes results. Set by `python afm.py test`; defaults allow running a test alone:

    AFM_PAGE=dist/platform/en/index.html python tests/ui/t_plans.py
"""
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
PAGE_PATH = pathlib.Path(os.environ.get('AFM_PAGE', ROOT / 'dist' / 'training' / 'en' / 'index.html')).resolve()
PAGE = PAGE_PATH.as_uri()
RESULT = os.environ.get('AFM_RESULT', str(ROOT / 'tests' / 'results' / (pathlib.Path(os.environ.get('AFM_TEST', 'test')).stem + '.json')))
SHOTS = ROOT / 'tests' / 'results' / 'screenshots'; SHOTS.mkdir(parents=True, exist_ok=True)
TAMIL_SRC = ROOT / 'src' / 'i18n' / 'ta'
