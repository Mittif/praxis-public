// Self-authored content only; no user accounts or third-party questions.
export function makeMistakes(total = 27) {
  const questions = [], records = {}, stats = {};
  for (let i = 0; i < total; i++) {
    const q = { id: 'pagination-demo-' + i, bank: i % 2 ? '真题速攻-金融' : '真题速攻-经济基础',
      subject: i % 2 ? '金融' : '基础', series: '真题速攻', set: 'demo-set', set_order: 1, set_label: '自编演示',
      no: i + 1, module: '演示模块', type: 'single', multiple: false, material: '', images: [],
      stem: `自编题目 ${i + 1}：请选择符合题意的选项。`,
      options: 'ABCD'.split('').map(c => ({ id: 'fixed-' + c.toLowerCase(), source_label: c, text: '自编内容 ' + c })),
    };
    const saved = structuredClone(q);
    saved.options = [saved.options[1], saved.options[2], saved.options[0], saved.options[3]].map((o, i) => ({ ...o, label: 'ABCD'[i] }));
    records[q.id] = { question: saved, answer: ['fixed-a'], selected: ['fixed-b'], correct: false,
      explanation: '选项A正确，B选项错误。公式C=2。', explanation_mode: 'mapped', explanation_parts: [
        { type: 'text', text: '选项' }, { type: 'option_ref', option_ids: ['fixed-a'], source_text: 'A' },
        { type: 'text', text: '正确，' }, { type: 'option_ref', option_ids: ['fixed-b'], source_text: 'B' },
        { type: 'text', text: '选项错误。公式C=2。' },
      ],
    };
    stats[q.id] = { attempts: 1, errors: 1, streak: 0, pending: true, last: 1000 - i };
    if (i === total - 1) { q.stem = '修订后的题干'; q.options[0].text = '修订后的内容'; }
    questions.push(q);
  }
  return { questions, records, stats, stars: [], user_id: 'pagination-user', resume: null };
}
