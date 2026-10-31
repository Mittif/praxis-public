import os
import sqlite3
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient
from tests.test_api import client
from backend.app import app, e, users, select, limits
from scripts.create_admin import create_admin


def test_admin_login_and_duplicate_protection():
    limits.clear()
    account = create_admin('admin-test', 'unitpassword123')
    c = TestClient(app)
    assert c.post('/api/v1/auth/login', json={
        'name': account['name'], 'password': 'unitpassword123'
    }).status_code == 200
    assert c.get('/api/v1/me').json()['role'] == 'admin'
    with e.connect() as connection:
        original = dict(connection.execute(select(users).where(
            users.c.id == account['id'])).mappings().one())
    assert original['password'] != 'unitpassword123'
    with pytest.raises(ValueError, match='已存在'):
        create_admin('admin-test', 'differentpassword')
    with e.connect() as connection:
        unchanged = dict(connection.execute(select(users).where(
            users.c.id == account['id'])).mappings().one())
    assert original == unchanged


def test_registration_cannot_grant_admin_role():
    c = TestClient(app)
    assert c.post('/api/v1/auth/register', json={
        'name': 'ordinary-role', 'password': 'unitpassword123', 'role': 'admin'
    }).status_code == 200
    assert c.get('/api/v1/me').json()['role'] == 'user'


def test_role_migration_preserves_accounts(tmp_path):
    db = tmp_path / 'legacy.db'
    env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + str(db)}
    subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', '001'],
                   env=env, check=True, capture_output=True)
    with sqlite3.connect(db) as connection:
        connection.execute('INSERT INTO accounts VALUES (?, ?, ?)',
                           ('legacy-id', 'legacy-user', 'existing-password-hash'))
    subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'],
                   env=env, check=True, capture_output=True)
    with sqlite3.connect(db) as connection:
        assert connection.execute('SELECT id, name, password, role FROM accounts').fetchone() == (
            'legacy-id', 'legacy-user', 'existing-password-hash', 'user')
        assert connection.execute('SELECT version_num FROM alembic_version').fetchone() == ('003',)
