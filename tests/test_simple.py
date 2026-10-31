import copy

import pytest
from fastapi.testclient import TestClient

from tests.test_api import client
from backend.app import app, lookup, limits
import backend.simple as simple


@pytest.fixture(autouse=True)
def clear_limit():
    limits.clear()


def single_questions(count=3):
    return [q for q in lookup.values() if not q['multiple']][:count]


def begin(c, ids, **extra):
    version = c.get('/api/v1/simple/catalog').json()['version']
    response = c.post('/api/v1/simple/sessions', json={'ids': ids, 'version': version, **extra})
    assert response.status_code == 200
    return response.json()['id']


def test_simple_requires_shared_login_and_catalog_does_not_include_answers():
    anonymous = TestClient(app)
    for path in ('/api/v1/simple/catalog', '/api/v1/simple/state', '/api/v1/bookmarks'):
        response = anonymous.get(path)
        assert response.status_code == 401 and response.headers['cache-control'] == 'no-store'
    c = client('simple-catalog')
    assert c.get('/api/v1/simple/state').json()['user_id'] == c.get('/api/v1/me').json()['id']
    catalog = c.get('/api/v1/simple/catalog').json()
    assert len(catalog['questions']) == len(lookup)
    assert all('answer' not in q and 'explanation' not in q for q in catalog['questions'])
    q = single_questions(1)[0]
    original = copy.deepcopy(q)
    begin(c, [q['id']])
    assert q == original


def test_automatic_resume_matches_catalog_version_and_explicit_resume_keeps_snapshot(monkeypatch):
    from tests.test_explanation_refs import question
    original = question()
    monkeypatch.setitem(simple.lookup, original['id'], original)
    monkeypatch.setattr(simple, 'catalog_version', 'demo-version-one')
    c = client('simple-version-resume')
    payload = {'ids': [original['id']], 'version': 'demo-version-one'}
    old = c.post('/api/v1/simple/sessions', json=payload).json()['id']
    assert c.post('/api/v1/simple/sessions', json=payload).json()['id'] == old
    updated = copy.deepcopy(original)
    updated.update(stem='修订后的自编题目', answer=['B'], explanation='选项B正确。')
    monkeypatch.setitem(simple.lookup, original['id'], updated)
    monkeypatch.setattr(simple, 'catalog_version', 'demo-version-two')
    payload['version'] = 'demo-version-two'
    fresh = c.post('/api/v1/simple/sessions', json=payload).json()['id']
    assert fresh != old
    assert c.post('/api/v1/simple/sessions', json=payload).json()['id'] == fresh
    assert c.get('/api/v1/simple/sessions/' + fresh).json()['questions'][0]['stem'] == updated['stem']
    assert c.get('/api/v1/simple/sessions/' + old).json()['questions'][0]['stem'] == original['stem']
    assert c.post('/api/v1/simple/sessions/' + old + '/answers', json={'index': 0, 'options': ['A']}).json()['correct']
    assert c.post('/api/v1/simple/sessions/' + fresh + '/answers', json={'index': 0, 'options': ['B']}).json()['correct']


def test_random_access_preserves_primary_progress_grading_and_idempotence():
    c = client('simple-jump')
    qs = single_questions()
    sid = begin(c, [q['id'] for q in qs])
    path = f'/api/v1/simple/sessions/{sid}/answers'
    result = c.post(path, json={'index': 2, 'options': qs[2]['answer']})
    assert result.status_code == 200 and result.json()['correct']
    main = c.get(f'/api/v1/practice-sessions/{sid}').json()
    assert main['index'] == 0 and main['question']['id'] == qs[0]['id']
    wrong = next(o['id'] for o in qs[0]['options'] if o['id'] not in qs[0]['answer'])
    assert not c.post(path, json={'index': 0, 'options': [wrong]}).json()['correct']
    assert c.post(path, json={'index': 1, 'options': qs[1]['answer']}).json()['correct']
    assert c.get(f'/api/v1/practice-sessions/{sid}').json()['index'] == 3
    assert c.post(path, json={'index': 2, 'options': []}).status_code == 422
    assert c.post(path, json={'index': 2, 'options': [qs[2]['options'][0]['id']]}).json() == result.json()
    assert c.get('/api/v1/stats').json()[qs[2]['id']]['attempts'] == 1
    view = c.get(f'/api/v1/simple/sessions/{sid}').json()
    assert len(view['results']) == 3 and all('answer' not in q for q in view['questions'])
    assert c.get('/api/v1/history').json()[0]['correct'] == 2


def test_primary_answers_and_two_correct_mastery_are_shared():
    c = client('simple-mastery')
    q = single_questions(1)[0]
    sid = begin(c, [q['id']])
    wrong = next(o['id'] for o in q['options'] if o['id'] not in q['answer'])
    c.post(f'/api/v1/simple/sessions/{sid}/answers', json={'index': 0, 'options': [wrong]})
    assert c.get('/api/v1/mistakes').json()[0]['pending']
    for streak in (1, 2):
        primary = c.post('/api/v1/practice-sessions', json={'mode': 'mistakes', 'count': 20}).json()['id']
        presented = c.get(f'/api/v1/practice-sessions/{primary}').json()['question']
        assert presented['id'] == q['id']
        c.post(f'/api/v1/practice-sessions/{primary}/answers', json={'index': 0, 'options': q['answer']})
        state = c.get('/api/v1/simple/state').json()
        assert state['stats'][q['id']]['streak'] == streak
        assert state['stats'][q['id']]['pending'] is (streak < 2)
        assert state['records'][q['id']]['selected'] == q['answer']
    assert c.get('/api/v1/stats').json()[q['id']]['attempts'] == 3


def test_sessions_and_bookmarks_are_scoped_to_the_current_account():
    c, other = client('simple-owner'), client('simple-other')
    q = single_questions(1)[0]
    sid = begin(c, [q['id']])
    assert other.get(f'/api/v1/simple/sessions/{sid}').status_code == 404
    assert other.post(f'/api/v1/simple/sessions/{sid}/answers', json={'index': 0, 'options': q['answer']}).status_code == 404
    assert c.post('/api/v1/bookmarks/' + q['id'], json={'starred': True}).json()['starred']
    assert c.get('/api/v1/bookmarks').json() == {q['id']: True}
    assert c.get('/api/v1/simple/state').json()['stars'] == [q['id']]
    assert other.get('/api/v1/bookmarks').json() == {}
    c.post('/api/v1/bookmarks/' + q['id'], json={'starred': False})
    assert c.get('/api/v1/simple/state').json()['stars'] == []
    assert c.post('/api/v1/bookmarks/missing-question', json={'starred': True}).status_code == 404


def test_review_has_no_grading_side_effects_and_import_cannot_override_primary_records(monkeypatch):
    c = client('simple-import')
    q, second = single_questions(2)
    review = c.get('/api/v1/simple/questions/' + q['id'] + '/review')
    assert review.json()['answer'] == q['answer']
    assert c.get('/api/v1/stats').json() == {}
    wrong = next(o['id'] for o in q['options'] if o['id'] not in q['answer'])
    body = {'records': {q['id']: {'selected': [wrong], 'ok': True, 'star': True}}}
    assert c.post('/api/v1/simple/import', json=body).json()['imported'] == 1
    assert c.get('/api/v1/stats').json()[q['id']]['errors'] == 1
    body['records'][q['id']]['selected'] = q['answer']
    assert c.post('/api/v1/simple/import', json=body).json()['imported'] == 0
    assert c.get('/api/v1/stats').json()[q['id']]['attempts'] == 1
    monkeypatch.setattr(simple, 'legacy_ids', {'reference-1': second['id']})
    imported = c.post('/api/v1/simple/import', json={'records': {'reference-1': {'c': ''.join(second['answer']), 'ok': False}}})
    assert imported.json()['imported'] == 1
    assert c.get('/api/v1/simple/state').json()['records'][second['id']]['correct']


def test_simple_rejects_stale_banks_duplicate_ids_and_invalid_options():
    c = client('simple-validation')
    q = single_questions(1)[0]
    assert c.post('/api/v1/simple/sessions', json={'ids': [q['id']], 'version': 'stale'}).status_code == 409
    version = c.get('/api/v1/simple/catalog').json()['version']
    assert c.post('/api/v1/simple/sessions', json={'ids': [q['id'], q['id']], 'version': version}).status_code == 400
    sid = begin(c, [q['id']])
    assert c.post(f'/api/v1/simple/sessions/{sid}/answers', json={'index': 0, 'options': ['not-an-option']}).status_code == 400
    assert c.post(f'/api/v1/simple/sessions/{sid}/answers', json={'index': 1, 'options': q['answer']}).status_code == 409
