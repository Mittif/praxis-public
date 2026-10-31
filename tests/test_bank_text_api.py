import json

from tests.test_api import client
from backend.app import e, sessions, insert, select, limits
from tests.test_bank_text import sample_question


def test_legacy_session_display_is_reflowed_without_rewriting_saved_content():
    limits.clear()
    c = client('legacy-text-layout')
    uid = c.get('/api/v1/me').json()['id']
    question = sample_question()
    body = {'items': [question], 'index': 0, 'results': {}, 'mode': 'mixed',
            'bank': None, 'subject': '全部', 'created': 1793380000}
    original = json.dumps(body, ensure_ascii=False)
    sid = 'legacy-text-layout-session'
    with e.begin() as connection:
        connection.execute(insert(sessions).values(id=sid, uid=uid, body=original, version=0))
    url = '/api/v1/practice-sessions/' + sid
    shown = c.get(url).json()['question']
    assert shown['stem'] == '自编演示中资料的金额是多少？'
    assert shown['options'][0] == {'id': 'fixed-a', 'text': '一百元'}
    assert 'answer' not in shown and 'explanation' not in shown
    with e.connect() as connection:
        assert connection.execute(select(sessions.c.body).where(sessions.c.id == sid)).scalar_one() == original
    answer = {'index': 0, 'options': ['fixed-a']}
    result = c.post(url + '/answers', json=answer).json()
    assert result['correct'] and result['answer'] == ['fixed-a']
    assert result['explanation'] == '演示金额为100元。'
    with e.connect() as connection:
        saved = connection.execute(select(sessions.c.body).where(sessions.c.id == sid)).scalar_one()
    stored = json.loads(saved)
    assert stored['items'][0] == question
    assert stored['results']['0']['explanation'] == question['explanation']
    assert c.get(url).json()['result'] == result
    assert c.get(url).json()['results'] == [result]
    simple = c.get('/api/v1/simple/sessions/' + sid).json()
    assert simple['questions'][0]['stem'] == shown['stem']
    assert simple['results']['0']['explanation'] == result['explanation']
    assert c.get('/api/v1/simple/state').json()['records'][question['id']]['explanation'] == result['explanation']
    assert c.post(url + '/answers', json=answer).json() == result
    with e.connect() as connection:
        assert connection.execute(select(sessions.c.body).where(sessions.c.id == sid)).scalar_one() == saved
    assert c.get('/api/v1/stats').json()[question['id']]['attempts'] == 1
