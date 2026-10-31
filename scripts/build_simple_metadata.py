"""Match optional reference display labels to canonical IDs without importing answers."""
import argparse
from collections import defaultdict
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]


class Reference(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.data = ''

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and dict(attrs).get('id') == 'qdata':
            self.active = True

    def handle_data(self, data):
        if self.active:
            self.data += data

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active = False


def normalized(text):
    return re.sub(r'[\W_]+', '', unicodedata.normalize('NFKC', text)).lower()


def fingerprint(stem, options):
    return normalized(stem), tuple(normalized(option) for option in options)


def source_set(question):
    source = question.get('source', '')
    if '金融' in question['bank']:
        if '案例' in source:
            return '4'
        if '多选' in source:
            return '3'
    part = re.search(r'[（(](\d+)[）)]', source)
    return part[1] if part else ''


def build(reference, bank):
    parser = Reference()
    parser.feed(Path(reference).read_text())
    references = json.loads(parser.data)
    canonical = json.loads(Path(bank).read_text())
    index = defaultdict(list)
    for question in canonical:
        if question['bank'].startswith('真题速攻'):
            index[fingerprint(question['stem'], [o['text'] for o in question['options']])].append(question)
    labels, aliases, unmatched = {}, {}, 0
    for question in references:
        candidates = [q for q in index[fingerprint(question['stem'], question['options'])]
                      if ('金融' in q['bank']) == (question['subject'] == '金融')]
        if len(candidates) > 1:
            candidates = [q for q in candidates if source_set(q) == str(question['set'])
                          and str(q.get('number')) == str(question['no'])]
        if len(candidates) != 1:
            unmatched += 1
            continue
        canonical_id = candidates[0]['id']
        group = f"第 {question['set']} 套" if question['subject'] == '基础' else {'1': '单选（一）', '2': '单选（二）', '3': '多选', '4': '案例'}.get(str(question['set']), '')
        labels[canonical_id] = {'module': str(question['module']), 'set_label': group}
        aliases[question['id']] = canonical_id
    return {'questions': labels, 'legacy_ids': aliases}, {'matched': len(aliases), 'unmatched': unmatched, 'canonical': len(canonical)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reference', type=Path, required=True)
    parser.add_argument('--bank', type=Path, default=ROOT / 'data/questions.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/simple-metadata.json')
    args = parser.parse_args()
    result, summary = build(args.reference, args.bank)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    args.output.chmod(0o600)
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
