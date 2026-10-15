"""Web server (server/app.py): routes, settings and the production secret guard. Needs dist/ (python afm.py build)."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from server.app import check_production_secrets, create_server  # noqa: E402

BUILT = (ROOT / 'dist' / 'platform' / 'en' / 'index.html').is_file()
needs_build = pytest.mark.skipif(not BUILT, reason='run python afm.py build first')


def client(**env):
    return TestClient(create_server(env))


def test_health_reports_version_and_api():
    body = client().get('/healthz').json()
    assert body['status'] == 'ok'
    assert body['version'] == (ROOT / 'VERSION').read_text().strip()
    assert body['api'] is True


@needs_build
def test_pages_and_start_page():
    c = client()
    assert c.get('/platform/en/').status_code == 200
    assert 'href="/platform/ta/"' in c.get('/').text


@needs_build
def test_tamil_training_audio_files_are_served():
    if not (ROOT / 'dist' / 'training' / 'ta' / 'audio-ta-1.js').is_file():
        pytest.skip('training/ta not built')
    assert client().get('/training/ta/audio-ta-1.js').status_code == 200


def test_api_mounted_under_api():
    c = client()
    assert c.get('/api/openapi.json').status_code == 200
    assert c.get('/api/v1/authz/roles').status_code == 401      # signed-in only


def test_api_can_be_switched_off_and_editions_limited():
    c = client(AFM_ENABLE_API='false', AFM_EDITIONS='platform')
    assert c.get('/api/openapi.json').status_code == 404
    assert c.get('/training/en/').status_code == 404
    assert c.get('/healthz').json()['api'] is False


def test_production_refuses_sample_secrets():
    with pytest.raises(RuntimeError, match='AFM_JWT_SECRET'):
        create_server({'AFM_ENV': 'production'})
    good = {'AFM_JWT_SECRET': 'x' * 48, 'AFM_VAULT_MASTER_KEY': 'k' * 44, 'AFM_PLATFORM_ADMIN_PASSWORD': 'a-long-password'}
    assert check_production_secrets(good) == []


def test_production_pages_only_needs_no_secrets():
    assert client(AFM_ENV='production', AFM_ENABLE_API='false').get('/healthz').status_code == 200
