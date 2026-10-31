"""Option identities, display labels and immutable session order must agree."""
import copy
import random
from fastapi.testclient import TestClient
from tests.test_api import client
from backend.app import app, question_snapshot, answer_labels, limits


def sample():
    return {
        'id': 'shuffle-fixture', 'bank': '真题速攻-金融', 'multiple': True,
        'stem': '请选择正确的说法。',
        'options': [{'id': label, 'text': f'内容-{label}'} for label in 'ABCDE'],
        'answer': ['A', 'D'], 'explanation': '原题A、D正确；公式C不应被修改。',
    }


def test_shuffle_changes_labels_without_mutating_source():
    source = sample()
    original = copy.deepcopy(source)
    q = question_snapshot(source, random.Random(42))
    assert source == original
    assert [o['id'] for o in q['options']] != [o['id'] for o in source['options']]
    assert [o['label'] for o in q['options']] == list('ABCDE')
    assert {o['id']: o['text'] for o in q['options']} == {o['id']: o['text'] for o in source['options']}
    assert q['answer'] == source['answer']
    assert q['explanation'] == source['explanation']
    for o in q['options']:
        assert o['source_label'] == o['id']
    assert answer_labels(q, q['answer']) == [o['label'] for o in q['options'] if o['id'] in ('A', 'D')]


def test_position_dependent_options_keep_meaning():
    for text in ['以上都正确', 'A和B均正确', '选项A是正确的', 'AB均正确', '前两项正确', '上述说法均正确']:
        q = sample()
        q['options'][-1]['text'] = text
        snapshot = question_snapshot(q, random.Random(42))
        assert snapshot['option_order_locked']
        assert [o['id'] for o in snapshot['options']] == list('ABCDE')
    explicit = sample()
    explicit['shuffle_options'] = False
    assert question_snapshot(explicit, random.Random(42))['option_order_locked']


def test_shuffled_session_grading_resume_and_history(monkeypatch):
    import backend.app as module
    limits.clear()
    monkeypatch.setattr(module, 'questions', [sample()])
    c = client('shuffle-identity')
    sid = c.post('/api/v1/practice-sessions', json={'mode': 'mixed', 'count': 20}).json()['id']
    url = '/api/v1/practice-sessions/' + sid
    initial = c.get(url).json()
    shown = initial['question']
    assert 'answer' not in shown
    assert c.get(url).json()['question']['options'] == shown['options']
    correct_ids = [o['id'] for o in shown['options'] if o['text'] in ('内容-A', '内容-D')]
    result = c.post(url + '/answers', json={'index': 0, 'options': correct_ids}).json()
    assert result['correct']
    assert result['answer_labels'] == [o['label'] for o in shown['options'] if o['id'] in correct_ids]
    assert result['selected_labels'] == result['answer_labels']
    # Changing the maintenance bank cannot re-order or replace a saved session.
    monkeypatch.setattr(module, 'questions', [])
    saved = c.get(url).json()
    assert saved['question']['options'] == shown['options']
    assert saved['result'] == result
    assert saved['results'][0]['question']['options'] == shown['options']
    assert c.post(url + '/answers', json={'index': 0, 'options': ['B']}).json() == result


def test_existing_sessions_keep_original_labels():
    from backend.app import e, sessions, insert
    import json
    limits.clear()
    c = client('shuffle-legacy')
    uid = c.get('/api/v1/me').json()['id']
    body = {'items': [sample()], 'index': 0, 'results': {}, 'mode': 'mixed', 'bank': None,
            'subject': '金融', 'created': 1793380000}
    with e.begin() as connection:
        connection.execute(insert(sessions).values(id='legacy-order', uid=uid, body=json.dumps(body), version=0))
    url = '/api/v1/practice-sessions/legacy-order'
    shown = c.get(url).json()['question']
    assert [o['id'] for o in shown['options']] == list('ABCDE')
    assert all('label' not in o for o in shown['options'])
    result = c.post(url + '/answers', json={'index': 0, 'options': ['D', 'A']}).json()
    assert result['correct'] and result['answer_labels'] == ['A', 'D']
