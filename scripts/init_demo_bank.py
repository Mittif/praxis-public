"""Create original arithmetic demo content without overwriting a private bank."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANKS = ('真题速攻-经济基础', '高频错题-经济基础', '真题速攻-金融', '高频错题-金融')


def demo_questions():
    questions = []
    for bank_index, bank in enumerate(BANKS):
        for number in range(1, 51):
            n = bank_index * 100 + number
            multiple = number % 2 == 0
            if multiple:
                values = list(range(n * 2, n * 2 + 4))
                stem = '下列数字中，哪些是偶数？'
                answer = ['A', 'C']
                explanation = f'{values[0]} 和 {values[2]} 能被 2 整除，因此是偶数。'
            else:
                total = n + number
                values = [total, total - 1, total + 1, total + 2]
                stem = f'{n} + {number} 的计算结果是？'
                answer = ['A']
                explanation = f'{n} + {number} = {total}。'
            questions.append({
                'id': f'demo-{bank_index + 1}-{number:03}', 'revision': 1, 'status': 'candidate',
                'bank': bank, 'stem': '【自编演示题】' + stem, 'multiple': multiple,
                'options': [{'id': label, 'text': str(value)} for label, value in zip('ABCD', values)],
                'answer': answer, 'explanation': explanation,
                'source': '自编算术演示，不是考试真题', 'number': str(number), 'images': [],
            })
    return questions


def write_demo_bank(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(demo_questions(), ensure_ascii=False, indent=2) + '\n'
    # Exclusive creation also rejects symlinks and protects existing private content.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        handle.write(content)
    (path.parent / 'assets').mkdir(exist_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/questions.json')
    args = parser.parse_args()
    try:
        write_demo_bank(args.output)
    except FileExistsError:
        parser.exit(1, '目标题库已存在，未覆盖。请保留现有资料，或使用 --output 指定其他路径。\n')
    print('已生成 200 道自编演示题；不含第三方题库或账号数据。')


if __name__ == '__main__':
    main()
