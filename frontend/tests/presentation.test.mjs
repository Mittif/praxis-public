import test from 'node:test';
import assert from 'node:assert/strict';
import { displayOptionLabel, explanationView, recordQuestion, pageInfo, PHONE_PAGE_SIZE, DESKTOP_PAGE_SIZE } from '../shared/presentation.js';

const q = { id: 'demo', stem: '自编题目', options: 'ABCD'.split('').map(id => ({ id, text: '内容' + id })) };
const result = { question: q, explanation: '选项A正确，BCD错误。公式C=2。Pearson与ABC公司。', explanation_mode: 'mapped', explanation_parts: [
  { type: 'text', text: '选项' }, { type: 'option_ref', option_ids: ['A'], source_text: 'A' },
  { type: 'text', text: '正确，' }, { type: 'option_ref', option_ids: ['B', 'C', 'D'], source_text: 'BCD' },
  { type: 'text', text: '错误。公式C=2。Pearson与ABC公司。' },
] };

test('simultaneous letter cycles preserve meaning, formulas and English', () => {
  const shuffled = { ...q, options: [q.options[2], q.options[0], q.options[3], q.options[1]].map((o, i) => ({ ...o, source_label: o.id, label: 'ABCD'[i] })) };
  assert.equal(explanationView(shuffled, result).text, '选项B正确，D、A、C错误。公式C=2。Pearson与ABC公司。');
  assert.equal(result.explanation, '选项A正确，BCD错误。公式C=2。Pearson与ABC公司。');
});

test('a shuffled main-site record adapts to the simple site current order', () => {
  const saved = { ...q, options: [...q.options].reverse().map((o, i) => ({ ...o, source_label: o.id, label: 'ABCD'[i] })) };
  const shared = { ...result, question: saved };
  assert.equal(recordQuestion(q, shared), q);
  assert.equal(explanationView(q, shared).text, '选项A正确，B、C、D错误。公式C=2。Pearson与ABC公司。');
  assert.equal(explanationView(saved, shared).text, '选项D正确，C、B、A错误。公式C=2。Pearson与ABC公司。');
});

test('content revisions use the saved stem and options for historical answers', () => {
  const current = structuredClone(q); current.options[0].text = '已修订内容'; current.stem = '新题干';
  assert.deepEqual(recordQuestion(current, result).options, q.options);
  assert.equal(recordQuestion(current, result).stem, q.stem);
  assert.equal(current.stem, '新题干');
});

test('unproven references and legacy payloads fall back to source prose', () => {
  for (const broken of [ { ...result, explanation_mode: 'original' }, { explanation: result.explanation },
    { ...result, explanation_parts: [] }, { ...result, explanation_parts: [{ type: 'option_ref', option_ids: ['missing'], source_text: result.explanation }] },
    { ...result, explanation_parts: [{ type: 'text', text: 'text changed' }] } ]) {
    const view = explanationView(q, broken);
    assert.equal(view.text, result.explanation); assert.equal(view.mapped, false);
  }
});

test('duplicate display labels fail safely instead of presenting an ambiguous answer', () => {
  assert.equal(explanationView({ ...q, options: q.options.map(o => ({ ...o, label: 'A' })) }, result).mapped, false);
});

test('both interfaces and explanation references use the same legacy and opaque-ID labels', () => {
  assert.equal(displayOptionLabel({ id: 'D', text: '' }, 0), 'D');
  assert.equal(displayOptionLabel({ id: 'opaque', text: '' }, 1), 'B');
  assert.equal(displayOptionLabel({ id: 'opaque', source_label: 'C', text: '' }, 0), 'C');
  assert.equal(displayOptionLabel({ id: 'D', source_label: 'D', label: 'B', text: '' }, 0), 'B');
});

test('desktop and phone page boundaries, final partial page, and empty list', () => {
  assert.equal(DESKTOP_PAGE_SIZE, 12); assert.equal(PHONE_PAGE_SIZE, 5);
  assert.deepEqual(pageInfo(27, 24, 12), { page: 2, pages: 3, start: 24, end: 27, total: 27, size: 12 });
  assert.deepEqual(pageInfo(27, 25, 5), { page: 5, pages: 6, start: 25, end: 27, total: 27, size: 5 });
  assert.deepEqual(pageInfo(0, 999, 5), { page: 0, pages: 1, start: 0, end: 0, total: 0, size: 5 });
  assert.equal(pageInfo(5, 0, 5).pages, 1);
  assert.equal(pageInfo(12, 0, 12).pages, 1);
});

test('resizing keeps the anchored row visible, and deletions clamp the final page', () => {
  for (const anchor of [0, 5, 12, 20, 24, 26]) {
    const phone = pageInfo(27, anchor, 5), desktop = pageInfo(27, anchor, 12);
    assert.ok(phone.start <= anchor && phone.end > anchor);
    assert.ok(desktop.start <= anchor && desktop.end > anchor);
  }
  assert.equal(pageInfo(6, 24, 5).start, 5);
  assert.equal(pageInfo(11, 24, 12).start, 0);
});
