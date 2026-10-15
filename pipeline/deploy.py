"""Step: deploy the built system to a target listed in config/deploy.json (STANDARD.md section 8).

    python afm.py deploy --list
    python afm.py deploy --target local                       # this computer, no Docker
    python afm.py deploy --target docker                      # this computer, in the container
    python afm.py deploy --target static --out site/          # plain files for any static host
    python afm.py deploy --target cloudrun --set project=my-project --set registry=asia-south1-docker.pkg.dev/my-project/afm --dry-run

Placeholders in a target's commands are filled from --set, then AFM_DEPLOY_<NAME> environment variables, then the
target's defaults, then the common defaults. Targets marked external show their commands and ask before running.
Adding a target means adding an entry to config/deploy.json; this file does not name any provider.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys

from pipeline.common import EDITIONS, LANGS, ROOT, out_dir

CONFIG = ROOT / 'config' / 'deploy.json'
PLACEHOLDER = re.compile(r'\{([a-z_]+)\}')
SECRET_NAME = re.compile(r'(password|secret|token|key)$')


def load() -> dict:
    return json.loads(CONFIG.read_text(encoding='utf-8'))


def list_targets() -> None:
    cfg = load()
    print(f'{"target":10s} {"external":9s} description')
    for name, t in cfg['targets'].items():
        print(f'{name:10s} {"yes" if t.get("external") else "no":9s} {t["description"]}')
        print(f'{"":21s}needs: {t.get("needs", "-")}')
        if t.get('required'):
            print(f'{"":21s}--set: {", ".join(t["required"])}')


def parse_sets(pairs: list[str] | None) -> dict:
    values = {}
    for pair in pairs or []:
        if '=' not in pair:
            raise SystemExit(f'--set expects name=value, got {pair!r}')
        k, v = pair.split('=', 1)
        k = k.strip().lower()
        if SECRET_NAME.search(k):
            raise SystemExit(f'--set {k}=… looks like a secret. Secrets go in the host\'s secret store (STANDARD.md section 7).')
        values[k] = v
    return values


def resolve(target: dict, sets: dict, extra: dict | None = None) -> dict:
    """All placeholder values for a target, with nested placeholders ({registry} inside {image}) filled."""
    cfg = load()
    values = {'version': (ROOT / 'VERSION').read_text().strip()}
    values.update(cfg.get('defaults', {}))
    values.update(target.get('defaults', {}))
    values.update(extra or {})
    for k, v in os.environ.items():
        if k.startswith('AFM_DEPLOY_'):
            values[k[len('AFM_DEPLOY_'):].lower()] = v
    values.update(sets)
    for _ in range(5):
        values = {k: PLACEHOLDER.sub(lambda m: values.get(m.group(1), m.group(0)), str(v)) for k, v in values.items()}
    return values


def fill(text: str, values: dict) -> str:
    missing = sorted({m for m in PLACEHOLDER.findall(text) if m not in values or PLACEHOLDER.search(values[m])})
    if missing:
        raise SystemExit('Missing values: ' + ', '.join(missing) + '. Pass them with --set name=value '
                         '(or AFM_DEPLOY_<NAME>). See: python afm.py deploy --list')
    return PLACEHOLDER.sub(lambda m: values[m.group(1)], text)


def ensure_env_file() -> None:
    """Create .env from .env.example with fresh random secrets when it does not exist. Never overwrites."""
    env = ROOT / '.env'
    if env.exists():
        return
    import base64
    fresh = {
        'AFM_JWT_SECRET': secrets.token_urlsafe(48),
        'AFM_VAULT_MASTER_KEY': base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),   # a Fernet key
        'AFM_PLATFORM_ADMIN_PASSWORD': secrets.token_urlsafe(18),
    }
    lines = []
    for line in (ROOT / '.env.example').read_text(encoding='utf-8').splitlines():
        k = line.split('=', 1)[0]
        lines.append(f'{k}={fresh[k]}' if k in fresh and line.strip() == f'{k}=' else line)
    env.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    try:
        env.chmod(0o600)
    except OSError:
        pass
    print(f'Created .env with fresh secrets (admin password: {fresh["AFM_PLATFORM_ADMIN_PASSWORD"]}). Keep it private; it is not committed.')


def load_env_file() -> dict:
    env = ROOT / '.env'
    out = {}
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                out[k.strip()] = v.strip()
    return out


def build_pages(editions: str) -> None:
    from pipeline.assemble import build
    for e in [x.strip() for x in editions.split(',') if x.strip()]:
        if e not in EDITIONS:
            raise SystemExit(f'Unknown edition {e!r}; choose from {", ".join(EDITIONS)}')
        for lang in LANGS:
            build(e, lang)


def run_local(values: dict, dry_run: bool) -> int:
    cmd = [sys.executable, '-m', 'uvicorn', 'server.app:app', '--host', values['host'], '--port', values['port']]
    print('Build pages for', values['editions'], '\nRun:', shlex.join(cmd))
    if dry_run:
        return 0
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
    except ImportError:
        raise SystemExit('The server needs the backend packages: pip install -r backend/requirements.txt')
    build_pages(values['editions'])
    env = {**load_env_file(), **os.environ}         # .env first; real environment variables win
    if not env.get('AFM_ENV'):
        env['AFM_ENV'] = 'development'
    env['AFM_EDITIONS'] = values['editions']
    print(f'Serving http://{values["host"]}:{values["port"]}  (Ctrl+C to stop)')
    try:
        return subprocess.call(cmd, cwd=ROOT, env=env)
    except KeyboardInterrupt:
        return 0


def run_static(values: dict, dry_run: bool) -> int:
    from server.pages import served_pages, start_page
    out = (ROOT / values['out']).resolve()          # an absolute --out stays as given
    print(f'Copy the built pages for {values["editions"]} to {out}')
    if dry_run:
        return 0
    build_pages(values['editions'])
    if out.exists():
        if out == ROOT or ROOT.is_relative_to(out):
            raise SystemExit(f'Refusing to replace {out}')
        shutil.rmtree(out)
    eds = [e.strip() for e in values['editions'].split(',')]
    for e in eds:
        for lang in LANGS:
            src = out_dir(e, lang)
            if (src / 'index.html').exists():
                shutil.copytree(src, out / e / lang)
    (out / 'index.html').write_text(start_page(served_pages(out, eds), api=False), encoding='utf-8')
    print(f'Wrote {out}. Upload its contents to any static host (S3, Azure Static Web Apps, Netlify, nginx, ...).')
    return 0


def run_commands(target: dict, values: dict, dry_run: bool, yes: bool) -> int:
    for step in target.get('prepare', []):
        if step == 'env-file' and not dry_run:
            ensure_env_file()
    if 'check' in target:
        check = fill(target['check'], values)
        print('Check:', check)
        if dry_run:
            print('(dry run: showing both branches)')
            branches = {'create': target['create'], 'update': target['update']}
        else:
            exists = subprocess.call(shlex.split(check), cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
            branches = {'update' if exists else 'create': target['update' if exists else 'create']}
    else:
        branches = {'run': target['commands']}
    plan = [(b, fill(c, values)) for b, cmds in branches.items() for c in cmds]
    for b, c in plan:
        print(f'[{b}] {c}' if b != 'run' else c)
    if target.get('notes'):
        print('Note:', target['notes'])
    if dry_run:
        return 0
    if target.get('external') and not yes:
        if not sys.stdin.isatty() or input('Run these? [y/N] ').strip().lower() not in ('y', 'yes'):
            print('Not run.')
            return 1
    for _, c in plan:
        print('>', c)
        code = subprocess.call(shlex.split(c), cwd=ROOT)
        if code:
            print(f'Stopped: the command above failed (exit {code}).')
            return code
    if target.get('after'):
        print(target['after'])
    return 0


def deploy(target_name: str, sets: list[str] | None = None, dry_run: bool = False, yes: bool = False, out: str | None = None) -> int:
    targets = load()['targets']
    if target_name not in targets:
        raise SystemExit(f'Unknown target {target_name!r}. Targets: {", ".join(targets)}')
    t = targets[target_name]
    values = resolve(t, parse_sets(sets), {'out': out} if out else None)
    missing = [r for r in t.get('required', []) if r not in values]
    if missing:
        raise SystemExit(f'{target_name} needs: ' + ', '.join(f'--set {m}=…' for m in missing))
    if t.get('builtin') == 'local':
        return run_local(values, dry_run)
    if t.get('builtin') == 'static':
        return run_static(values, dry_run)
    return run_commands(t, values, dry_run, yes)
