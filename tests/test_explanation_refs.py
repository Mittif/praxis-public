"""Self-authored fixtures: option identities bind prose, not variable names."""
import copy
import json
import random
import pytest

from tests.test_api import client
from backend.explanation_refs import compile_explanation
from backend.app import question_snapshot, answer_labels, display_result, limits, e, sessions, insert, select


def question(text='选项A正确，B选项错误。'):
    return {'id': 'ref-demo', 'stem': '自编示例：请选择。', 'bank': '真题速攻-金融', 'multiple': False,
            'options': [{'id': c, 'text': '自编内容' + c} for c in 'ABCD'], 'answer': ['A'], 'explanation': text}


def rebuild(parts):
    return ''.join(part.get('text', part.get('source_text', '')) for part in parts)


@pytest.mark.parametrize('text,ids', [
    ('选项A正确，B选项错误。', [['A'], ['B']]),
    ('B说法正确，ACD说法均为错误干扰项。故此题正确答案为B。', [['B'], ['A', 'C', 'D'], ['B']]),
    ('A、C正确，选项 B 与 D 错误。', [['A', 'C'], ['B', 'D']]),
    ('A和C两项正确，答案：A。', [['A', 'C'], ['A']]),
    ('本题选择D选项。', [['D']]),
    ('A项正确。公式C不应被修改。C = 2 + 3。GDP与Pearson、ABC公司不变。', [['A']]),
    ('选项A中使用A公司的数据，故选B。', [['A'], ['B']]),
    ('选项A正确。公式中的C错误，变量B = 2。', [['A']]),
    ('A项正确。A项目收益稳定，曲线CD说法正确，A级评级不变。', [['A']]),
])
def test_lossless_explicit_references(text, ids):
    result = compile_explanation(text, question(text))
    assert result['explanation_mode'] == 'mapped'
    assert rebuild(result['explanation_parts']) == text
    assert [part['option_ids'] for part in result['explanation_parts'] if part['type'] == 'option_ref'] == ids


def test_refs_use_opaque_stable_ids_and_never_display_labels():
    q = question('A、C正确。')
    for i, option in enumerate(q['options']):
        option.update(id='stable-' + str(i), source_label=option['id'], label='DCBA'[i])
    parts = compile_explanation(q['explanation'], q)['explanation_parts']
    assert parts[0]['option_ids'] == ['stable-0', 'stable-2']


def test_ambiguous_new_questions_keep_original_order():
    q = question('比较A与C之间的差异；选项B正确。')
    compiled = compile_explanation(q['explanation'], q)
    assert compiled['explanation_mode'] == 'original'
    assert compiled['explanation_parts'] == []
    assert compiled['issues'] == [{'offset': 2, 'reason': 'ambiguous_letter'}]
    snapshot = question_snapshot(q, random.Random(42))
    assert snapshot['option_order_locked']
    assert [option['id'] for option in snapshot['options']] == list('ABCD')


def test_missing_or_duplicate_source_labels_cannot_guess():
    q = question()
    for option in q['options']:
        option['id'] = 'opaque-' + option['id']
        option['label'] = 'A'  # A current label cannot establish provenance.
    assert compile_explanation(q['explanation'], q)['explanation_mode'] == 'original'
    assert question_snapshot(q, random.Random(42))['option_order_locked']
    for option in q['options']:
        option['source_label'] = 'B'
    assert compile_explanation(q['explanation'], q)['explanation_mode'] == 'original'


def test_conflicting_literal_context_and_malformed_provenance_fall_back():
    assert compile_explanation('选项A公司不同。', question())['explanation_mode'] == 'original'
    q = question()
    q['options'][0]['source_label'] = 7
    assert compile_explanation(q['explanation'], q)['explanation_mode'] == 'original'
    assert compile_explanation(None, q)['explanation_mode'] == 'original'
    assert question_snapshot(q, random.Random(42))['option_order_locked']


def test_legacy_opaque_ids_get_consistent_display_labels():
    q = question()
    q['options'][0]['id'] = 'opaque'
    assert answer_labels(q, ['opaque', 'C']) == ['A', 'C']


def test_display_is_deterministic_and_does_not_mutate_snapshot():
    q = question_snapshot(question(), random.Random(42))
    result = {'question': q, 'answer': ['A'], 'selected': ['B'], 'correct': False, 'explanation': q['explanation']}
    before = copy.deepcopy(result)
    output = display_result(result)
    assert result == before
    assert output == display_result(result) == display_result(output)
    assert output['explanation'] == before['explanation']
    assert rebuild(output['explanation_parts']) == output['explanation']
    assert not {'answer', 'explanation', 'explanation_parts', 'explanation_mode'} & output['question'].keys()


def test_cross_interface_review_uses_saved_content_and_authorization(monkeypatch):
    import backend.app as main
    import backend.simple as simple
    limits.clear()
    q = question()
    monkeypatch.setattr(main, 'questions', [q])
    monkeypatch.setitem(main.lookup, q['id'], q)
    monkeypatch.setitem(simple.lookup, q['id'], q)
    c = client('explanation-cross')
    sid = c.post('/api/v1/practice-sessions', json={'mode': 'mixed', 'count': 20}).json()['id']
    url = '/api/v1/practice-sessions/' + sid
    ungraded = c.get(url).json()
    assert 'explanation_parts' not in json.dumps(ungraded)
    assert ungraded['result'] is None
    shown = ungraded['question']
    result = c.post(url + '/answers', json={'index': 0, 'options': ['B']}).json()
    assert result['explanation_mode'] == 'mapped'
    assert result['question']['options'] == shown['options']
    # Current maintenance data changes; reviews must still use the old snapshot.
    replacement = question('选项D正确。')
    replacement['options'][0]['text'] = '新修订内容'
    replacement['answer'] = ['D']
    monkeypatch.setitem(main.lookup, q['id'], replacement)
    monkeypatch.setitem(simple.lookup, q['id'], replacement)
    assert c.get('/api/v1/mistakes/' + q['id'] + '/review').json() == result
    assert c.get('/api/v1/simple/state').json()['records'][q['id']] == result
    assert c.get(url).json()['result'] == result
    assert c.post(url + '/answers', json={'index': 0, 'options': ['C']}).json() == result
    assert c.get('/api/v1/simple/sessions/' + sid).json()['results']['0'] == result
    old_review = c.get('/api/v1/simple/questions/' + q['id'] + '/review', params={'session_id': sid}).json()
    assert old_review['explanation'] == q['explanation']
    assert old_review['answer'] == ['A']
    assert old_review['question']['options'] == shown['options']
    assert c.get('/api/v1/simple/questions/' + q['id'] + '/review').json()['answer'] == ['D']
    other = client('explanation-private')
    assert other.get('/api/v1/mistakes/' + q['id'] + '/review').status_code == 404
    assert other.get('/api/v1/simple/questions/' + q['id'] + '/review', params={'session_id': sid}).status_code == 404
    assert c.get('/api/v1/stats').json()[q['id']]['attempts'] == 1


def test_legacy_ambiguous_shuffled_snapshot_is_never_reordered():
    limits.clear()
    c = client('explanation-legacy')
    uid = c.get('/api/v1/me').json()['id']
    q = question('比较A与C之间的差异。')
    q['options'] = list(reversed(q['options']))
    for i, option in enumerate(q['options']):
        option['source_label'], option['label'] = option['id'], 'ABCD'[i]
    body = {'items': [q], 'index': 0, 'results': {}, 'mode': 'mixed', 'bank': None, 'subject': '金融', 'created': 1793380000}
    with e.begin() as connection:
        connection.execute(insert(sessions).values(id='ref-legacy', uid=uid, body=json.dumps(body), version=0))
    url = '/api/v1/practice-sessions/ref-legacy'
    output = c.post(url + '/answers', json={'index': 0, 'options': ['B']}).json()
    assert output['explanation_mode'] == 'original'
    assert output['explanation'] == q['explanation']
    assert output['question']['options'] == q['options']
    with e.connect() as connection:
        saved = json.loads(connection.execute(select(sessions.c.body).where(sessions.c.id == 'ref-legacy')).scalar_one())
    assert saved['items'] == [q]
    assert 'explanation_parts' not in saved['results']['0']


def test_audit_is_read_only_and_reports_no_source_text():
    from scripts.audit_explanations import audit
    questions = [question(), question('比较A与C之间的差异。')]
    original = copy.deepcopy(questions)
    report = audit(questions)
    assert questions == original
    assert report['counts'] == {'mapped': 1, 'with_references': 1, 'original': 1}
    assert '差异' not in json.dumps(report, ensure_ascii=False)
