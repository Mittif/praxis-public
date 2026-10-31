import copy
import json
from pathlib import Path
import re

import pytest

from backend.bank_text import normalize_question, normalize_text
from scripts.import_bank import ROOT, parse
from scripts.normalize_bank import clean_bank


@pytest.mark.parametrize(('before', 'after'), [
    ('【自编】共有3\n项，演示资\n料的金额为12000\n元。', '【自编】共有3项，演示资料的金额为12000元。'),
    ('选项甲的示例费\n用共计为\n25.则演示结果为25。', '选项甲的示例费用共计为25.则演示结果为25。'),
    ('数值为\n2.5%，示例序列是1.2、\n3.4、5.6。', '数值为2.5%，示例序列是1.2、3.4、5.6。'),
    ('The sample\nindex covers the demo\nitem.', 'The sample index covers the demo item.'),
    ('Consumer\nPrice Index', 'Consumer Price Index'),
    ('A self-\nauthored example.', 'A self-authored example.'),
    ('演示中流动\n比率为=120/40=3，本题示例完成。', '演示中流动比率为=120/40=3，本题示例完成。'),
    ('第一段中有断\n词。\n第二段为独立句。\n\n第三段。', '第一段中有断词。\n第二段为独立句。\n\n第三段。'),
    ('列表如下：\n（1）自编的第一条说\n明；\n（2）另一条说明。', '列表如下：\n（1）自编的第一条说明；\n（2）另一条说明。'),
    ('1.自编条目\n2.第二条目\n12.后续条目', '1.自编条目\n2.第二条目\n12.后续条目'),
    ('项目 收入 支出\n1.自编业务 20 30\n2.其他业务 10 15', '项目 收入 支出\n1.自编业务 20 30\n2.其他业务 10 15'),
    ('公式如下：\nY = α + βX\n₁ ₂\n随后演示文\n字继续。', '公式如下：\nY = α + βX\n₁ ₂\n随后演示文字继续。'),
])
def test_reflow_preserves_content_and_meaningful_structure(before, after):
    result = normalize_text(before)
    assert result == after
    assert normalize_text(result) == result
    assert re.sub(r'\s', '', result) == re.sub(r'\s', '', before)


def sample_question():
    return {'id': 'self-authored-layout-example', 'revision': 4, 'bank': '自编演示',
            'stem': '自编演示中资\n料的金额是多少？',
            'options': [{'id': 'fixed-a', 'text': '一\n百元'}, {'id': 'fixed-b', 'text': '二百元'}],
            'answer': ['fixed-a'], 'multiple': False, 'explanation': '演示金额为100\n元。',
            'material': '材料分\n成了两行。', 'source': 'self-authored.pdf', 'pages': [1, 1],
            'images': [], 'shuffle_options': False}


def test_question_metadata_and_input_are_not_mutated():
    source = sample_question()
    before = copy.deepcopy(source)
    result, changed = normalize_question(source)
    assert source == before
    assert set(changed) == {'stem', 'options[0].text', 'explanation', 'material'}
    assert result['revision'] == before['revision']
    assert {k: v for k, v in result.items() if k not in changed and k != 'options'} == {
        k: v for k, v in before.items() if k not in changed and k != 'options'}
    assert [o['id'] for o in result['options']] == ['fixed-a', 'fixed-b']


def test_apply_is_backed_up_atomic_and_idempotent(tmp_path):
    path = tmp_path / 'questions.json'
    original = json.dumps([sample_question()], ensure_ascii=False).encode()
    path.write_bytes(original)
    preview = clean_bank(path)
    assert preview['questions_changed'] == 1 and not preview['applied']
    assert path.read_bytes() == original and not (tmp_path / 'text-cleanup').exists()
    result = clean_bank(path, apply=True)
    assert result['applied'] and Path(result['backup']).read_bytes() == original
    assert Path(result['backup']).stat().st_mode & 0o777 == 0o600
    assert path.stat().st_mode & 0o777 == 0o600
    cleaned = json.loads(path.read_bytes())[0]
    assert cleaned['revision'] == 5 and cleaned['answer'] == ['fixed-a']
    current = path.read_bytes()
    again = clean_bank(path, apply=True)
    assert not again['applied'] and again['questions_changed'] == 0
    assert path.read_bytes() == current
    assert len(list((tmp_path / 'text-cleanup').iterdir())) == 1


def test_invalid_report_path_cannot_modify_the_bank(tmp_path):
    path = tmp_path / 'questions.json'
    original = json.dumps([sample_question()], ensure_ascii=False).encode()
    path.write_bytes(original)
    with pytest.raises(ValueError):
        clean_bank(path, apply=True, report_path=path)
    assert path.read_bytes() == original


def test_pdf_import_reflows_only_after_finding_question_and_option_boundaries():
    pages = ['1.【单选题】自编演示金额合\n计为多少？\nA. 一\n百元\nB. 二百元\nC. 三百元\nD. 四百元\n【答案】A【解析】演示金额为100\n元。']
    questions, issues = parse(ROOT / '题库/题-自编演示/self-authored.pdf', pages)
    assert not issues and len(questions) == 1
    question = questions[0]
    assert question['stem'] == '自编演示金额合计为多少？'
    assert question['options'][0]['text'] == '一百元'
    assert question['explanation'] == '演示金额为100元。'
    assert question['answer'] == ['A'] and question['revision'] == 1
    assert question['pages'] == [1, 1]
