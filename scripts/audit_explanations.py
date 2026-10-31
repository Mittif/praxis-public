"""Read-only option-reference audit. Reports contain IDs/offsets, never bank text."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.explanation_refs import compile_explanation


def audit(questions):
    counts, review = Counter(), []
    for q in questions:
        result = compile_explanation(q.get('explanation', ''), q)
        mode = result['explanation_mode']
        counts[mode] += 1
        if any(part['type'] == 'option_ref' for part in result['explanation_parts']):
            counts['with_references'] += 1
        if result['issues']:
            review.append({'id': q['id'], 'issues': result['issues']})
    return {'total': len(questions), 'counts': dict(counts), 'review': review}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, default=Path('data/questions.json'))
    parser.add_argument('--report', type=Path, default=Path('data/explanation-audit/report.json'))
    args = parser.parse_args()
    report = audit(json.loads(args.bank.read_text()))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key != 'review'}, ensure_ascii=False))
