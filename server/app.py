"""Web server: the built pages, the backend API and a health check, in one process.

    python afm.py deploy --target local          # build, then run this on http://127.0.0.1:8080
    uvicorn server.app:app --port 8080           # the same, by hand (after python afm.py build)

Paths:
    /                     start page linking to every built page
    /<edition>/<lang>/    the built pages from dist/ (training, platform; en, ta)
    /api/v1/..., /api/docs  the backend (backend/aifirstmart_connect), when AFM_ENABLE_API is true
    /healthz              {"status": "ok", "version": ...}

Settings come only from environment variables (STANDARD.md section 7). With AFM_ENV=production the server
refuses to start while any backend secret is missing or still has its sample value.
The start page and version helpers are in server/pages.py (standard library only, also used by deploy --target static).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from server.pages import EDITIONS, ROOT, served_pages, start_page, version

SAMPLE_SECRETS = {
    'AFM_JWT_SECRET': {'', 'dev-only-change-me-32-bytes-minimum!', 'change-me'},
    'AFM_VAULT_MASTER_KEY': {'', 'change-me'},
    'AFM_PLATFORM_ADMIN_PASSWORD': {'', 'change-this-password', 'change-me'},
}


def env_flag(name: str, default: bool, environ=os.environ) -> bool:
    v = environ.get(name)
    return default if v is None else v.strip().lower() in ('1', 'true', 'yes', 'on')


def check_production_secrets(environ=os.environ) -> list[str]:
    """Names of backend secrets that are missing or still sample values (checked when AFM_ENV=production)."""
    return [k for k, bad in SAMPLE_SECRETS.items() if environ.get(k, '').strip() in bad]


def create_server(environ=os.environ) -> FastAPI:
    production = environ.get('AFM_ENV', 'development').strip().lower() == 'production'
    api = env_flag('AFM_ENABLE_API', True, environ)
    if production and api:
        missing = check_production_secrets(environ)
        if missing:
            raise RuntimeError('AFM_ENV=production but these secrets are missing or sample values: ' + ', '.join(missing))
    dist = Path(environ.get('AFM_DIST', ROOT / 'dist'))
    editions = [e.strip() for e in environ.get('AFM_EDITIONS', ','.join(EDITIONS)).split(',') if e.strip() in EDITIONS]
    pages = served_pages(dist, editions)

    app = FastAPI(title='AIFirstMart mock', version=version(), docs_url=None, redoc_url=None, openapi_url=None)

    @app.get('/healthz')
    def healthz():
        return {'status': 'ok', 'version': version(), 'pages': [f'{e}/{lang}' for e, lang in pages], 'api': api}

    @app.get('/', response_class=HTMLResponse)
    def index():
        return start_page(pages, api)

    if api:
        for k in (*SAMPLE_SECRETS, 'AFM_DB_PATH', 'AFM_PLATFORM_ADMIN_EMAIL'):
            if os.environ.get(k) == '':      # an empty line in .env means "not set": the backend uses its own default
                del os.environ[k]
        sys.path.insert(0, str(ROOT / 'backend'))
        from aifirstmart_connect.api import create_app as create_backend
        app.mount('/api', create_backend())

    for e in editions:
        if (dist / e).is_dir():
            app.mount(f'/{e}', StaticFiles(directory=dist / e, html=True), name=e)
    return app


app = create_server()
