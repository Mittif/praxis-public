import secrets
from fastapi.testclient import TestClient
from tests.test_api import client
from backend.app import app, e
from scripts.check_secrets import scan_blob, sensitive_path


def test_validation_never_echoes_passwords_or_request_body():
    c = TestClient(app)
    secret = secrets.token_urlsafe(150)
    name = 'private-input-' + secrets.token_hex(6)
    for endpoint, body in (
        ('/api/v1/auth/login', {'name': name, 'password': secret}),
        ('/api/v1/auth/register', {'name': name, 'password': secret}),
        ('/api/v1/password', {'current': secret, 'password': secret}),
    ):
        response = c.post(endpoint, json=body)
        assert response.status_code == 422
        assert secret not in response.text and name not in response.text
        assert all(set(error) <= {'loc', 'msg', 'type'} for error in response.json()['detail'])
        assert response.headers['cache-control'] == 'no-store'


def test_personal_responses_are_not_cacheable_or_secret_bearing():
    c = client('privacy-user')
    for path in ('/api/v1/me', '/api/v1/history', '/api/v1/stats'):
        response = c.get(path)
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        assert all(key not in response.json() for key in ('password', 'token', 'DATABASE_URL'))
    assert e.hide_parameters is True


def test_secret_guard_detects_values_without_printing_them():
    secret = secrets.token_hex(24).encode()
    assert scan_blob(b'key=' + secret, [secret]) == ['local-secret-value']
    scheme = 'postgresql'
    assert scan_blob(f'{scheme}://user:private-value@host/db'.encode()) == ['credential-url']
    assert scan_blob(f'{scheme}://user:${{DB_PASSWORD}}@host/db'.encode()) == []
    for name in ('.env', 'frontend/.env.production', 'data/app.db', 'data/app.sqlite-wal', 'backups/export.sql', 'auth.key'):
        assert sensitive_path(name)
    assert not sensitive_path('.env.example')
    assert not sensitive_path('compose.yaml')


def test_bank_materials_require_login_even_for_conditional_requests(tmp_path, monkeypatch):
    from backend.app import limits
    limits.clear()
    mount = next(route.app for route in app.routes if getattr(route, 'name', '') == 'bank-assets')
    monkeypatch.setattr(mount, 'directory', str(tmp_path))
    monkeypatch.setattr(mount, 'all_directories', [str(tmp_path)])
    (tmp_path / 'self-authored.png').write_bytes(b'self-authored material fixture')
    path = '/assets-bank/self-authored.png'
    anonymous = TestClient(app)
    blocked = anonymous.get(path)
    assert blocked.status_code == 401
    assert blocked.headers['cache-control'] == 'no-store'
    owner = client('material-reader')
    response = owner.get(path)
    assert response.status_code == 200
    assert response.content == b'self-authored material fixture'
    assert response.headers['cache-control'] == 'no-store'
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert anonymous.get(path, headers={'If-None-Match': response.headers['etag']}).status_code == 401
    assert owner.post('/api/v1/logout', json={}).status_code == 200
    assert owner.get(path).status_code == 401
