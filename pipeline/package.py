"""Step: zip the project for sharing (sources, pipeline, tests, backend; built pages are left out, rebuild with afm.py build).

    python afm.py package                 # writes aifirstmart-mock.zip beside the project folder
"""
import zipfile
from pipeline.common import ROOT

SKIP_DIRS = {'dist', 'site', '__pycache__', '.pytest_cache', '.ruff_cache', 'results', '.git', '.venv', 'venv'}
SKIP_FILES = {'.DS_Store', '.env'}       # .env holds secrets; .env.example is kept


def package(name='aifirstmart-mock'):
    out = ROOT.parent / f'{name}.zip'; n = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(ROOT.rglob('*')):
            rel = p.relative_to(ROOT)
            if p.is_dir() or SKIP_DIRS & set(rel.parts) or p.name in SKIP_FILES or p.suffix in ('.sqlite', '.sqlite3'): continue
            if rel.parts[0] == 'tools' and p.suffix in ('.onnx', '.bin', '.pth'): continue   # voice models: download, see STANDARD.md
            z.write(p, f'{name}/{rel}'); n += 1
    print(f'{out} ({out.stat().st_size / 1e6:.1f} MB, {n} files)')
    return out
