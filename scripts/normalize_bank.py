"""Audit bank text; --apply makes a private backup and atomically reflows prose."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.bank_text import content_fields, normalize_question, normalize_text, review_flags
from scripts.bank import validate


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()


def private_write(path, body):
    with path.open('xb') as handle:
        os.fchmod(handle.fileno(), 0o600)
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())


def clean_bank(path, apply=False, report_path=None):
    path = Path(path).resolve()
    if report_path:
        report_path = Path(report_path).resolve()
        if report_path == path or report_path.exists():
            raise ValueError('Report must use a new path distinct from the bank')
    original = path.read_bytes()
    questions = validate(path)
    if questions != json.loads(original):
        raise RuntimeError('Bank changed while reading')
    cleaned, changes, reviews = [], [], []
    field_counts, bank_counts = Counter(), Counter()
    total_fields = before_breaks = after_breaks = 0
    for question in questions:
        updated, fields = normalize_question(question)
        originals = dict(content_fields(question))
        for field, text in content_fields(updated):
            total_fields += 1
            before_breaks += originals[field].count('\n')
            after_breaks += text.count('\n')
            if normalize_text(text) != text:
                raise ValueError(f'Non-idempotent text reflow: {question["id"]}/{field}')
            flags = review_flags(field, text)
            if flags:
                reviews.append({'id': question['id'], 'field': field, 'flags': flags})
        if fields:
            revision = question.get('revision', 1)
            if type(revision) is not int or revision < 1:
                raise ValueError('Question revision must be a positive integer')
            updated['revision'] = revision + 1
            field_counts.update('options' if field.startswith('options[') else field for field in fields)
            bank_counts[question['bank']] += 1
            changes.append({'id': question['id'], 'fields': fields, 'revision_before': revision, 'revision_after': revision + 1})
        # IDs, answers, option identities, sources, images and all other metadata stay exact.
        identity_before = {k: v for k, v in question.items() if k not in ('stem', 'explanation', 'material', 'options', 'revision')}
        identity_after = {k: v for k, v in updated.items() if k not in ('stem', 'explanation', 'material', 'options', 'revision')}
        if identity_before != identity_after or [dict(o, text='') for o in question['options']] != [dict(o, text='') for o in updated['options']]:
            raise ValueError('Question identity or grading metadata changed')
        cleaned.append(updated)
    result = (json.dumps(cleaned, ensure_ascii=False, indent=2) + '\n').encode()
    summary = {'questions_scanned': len(questions), 'text_fields_scanned': total_fields,
               'questions_changed': len(changes), 'fields_changed': dict(field_counts),
               'questions_changed_by_bank': dict(bank_counts), 'line_breaks_before': before_breaks,
               'line_breaks_after': after_breaks, 'line_breaks_removed': before_breaks - after_breaks,
               'non_whitespace_characters_preserved': True, 'grading_and_identity_preserved': True,
               'idempotent': True, 'review_fields': len(reviews),
               'review_questions': len({r['id'] for r in reviews}), 'applied': False,
               'sha256_before': fingerprint(original), 'sha256_after': fingerprint(result) if changes else fingerprint(original)}
    audit = None
    if apply and changes:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
        audit_root = path.parent / 'text-cleanup'
        audit_root.mkdir(mode=0o700, exist_ok=True)
        audit_root.chmod(0o700)
        audit = audit_root / stamp
        audit.mkdir(mode=0o700)
        audit.chmod(0o700)
        backup = audit / 'questions.before.json'
        private_write(backup, original)
        if fingerprint(backup.read_bytes()) != fingerprint(original):
            raise RuntimeError('Backup checksum mismatch')
        fd, temporary = tempfile.mkstemp(prefix='.bank-text-', dir=path.parent)
        try:
            with os.fdopen(fd, 'wb') as handle:
                os.fchmod(handle.fileno(), 0o600)
                handle.write(result)
                handle.flush()
                os.fsync(handle.fileno())
            validate(Path(temporary))
            if fingerprint(path.read_bytes()) != fingerprint(original):
                raise RuntimeError('Bank changed before replacement; original retained')
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)
        summary.update(applied=True, backup=str(backup))
    report = {'summary': summary, 'changes': changes, 'review': reviews}
    if audit:
        private_write(audit / 'report.json', (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        private_write(report_path, (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, default=ROOT / 'data/questions.json')
    parser.add_argument('--apply', action='store_true', help='备份后原子替换题库，并增加有变化题目的修订号')
    parser.add_argument('--report', type=Path, help='可选私有详细报告；不包含题干或解析原文')
    args = parser.parse_args()
    print(json.dumps(clean_bank(args.bank, args.apply, args.report), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
