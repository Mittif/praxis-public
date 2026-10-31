"""Reject private runtime data and symlinks in a repository's public history."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.package_public import private_content


def audit_public_history(root):
    root = Path(root)
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root)

    current = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    blocked = {raw.decode() for raw in current.split(b'\0') if raw and private_content(raw.decode())}
    commits = git('rev-list', '--all').decode().splitlines()
    inspected, historical, symlinks = set(), set(), set()
    for commit in commits:
        for entry in git('ls-tree', '-r', '-z', commit).split(b'\0'):
            if not entry:
                continue
            meta, raw = entry.split(b'\t', 1)
            mode, kind, oid = meta.split()
            name = raw.decode()
            if private_content(name):
                historical.add(name)
            if mode == b'120000':
                symlinks.add(name)
            inspected.add((oid, name))
    return {'commits': len(commits), 'paths_checked': len(inspected),
            'current_private_paths': sorted(blocked), 'historical_private_paths': sorted(historical),
            'historical_symlinks': sorted(symlinks)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    report = audit_public_history(args.root)
    if any(report[key] for key in ('current_private_paths', 'historical_private_paths', 'historical_symlinks')):
        # Counts are enough to explain the block without publishing source names.
        print('BLOCKED: public history contains excluded content: '
              f"current={len(report['current_private_paths'])}, "
              f"history={len(report['historical_private_paths'])}, "
              f"symlinks={len(report['historical_symlinks'])}.")
        print('Keep this repository intact; prepare a clean public copy with scripts/package_public.py. '
              'See docs/github-publication.md.')
        return 1
    print(f"PASS: {report['commits']} commits checked; no private runtime data or symlinks in public history.")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
