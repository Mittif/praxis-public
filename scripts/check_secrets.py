"""Focused, redacted Git/working-tree audit. Never print matched secret values."""
import argparse
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'private-key': re.compile(rb'-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----'),
    'aws-access-key': re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'bearer-token': re.compile(rb'\bBearer\s+[A-Za-z0-9_.-]{24,}'),
    'credential-url': re.compile(rb'(?:postgres(?:ql)?(?:\+\w+)?|mysql(?:\+\w+)?|redis|amqps?|https?)://[^\s/:@]+:([^\s/@]+)@'),
}


def sensitive_path(path):
    p = PurePosixPath(path)
    if p.name == '.env.example':
        return False
    return (p.name == '.env' or p.name.startswith('.env.')
            or p.name in ('.npmrc', '.pypirc', '.netrc', 'id_rsa', 'id_ed25519')
            or any(part in ('backups', 'secrets', 'credentials', '.aws', '.ssh') for part in p.parts)
            or p.suffix.lower() in ('.db', '.sqlite', '.sqlite3', '.pem', '.key', '.p12', '.pfx', '.dump')
            or p.name.endswith(('.db-wal', '.db-shm', '.db-journal', '.sqlite-wal',
                                '.sqlite-shm', '.sqlite-journal', '.sqlite3-wal',
                                '.sqlite3-shm', '.sqlite3-journal', '.sql.gz')))


def scan_blob(data, private_values=()):
    findings = set()
    for value in private_values:
        if value and value in data:
            findings.add('local-secret-value')
    for name, pattern in PATTERNS.items():
        for match in pattern.finditer(data):
            if name == 'credential-url' and (b'${' in match[1] or b'<' in match[1]):
                continue
            findings.add(name)
    return sorted(findings)


def local_values():
    values = []
    for directory in (ROOT, ROOT / 'frontend'):
        for path in directory.glob('.env*'):
            if path.name == '.env.example' or not path.is_file():
                continue
            for line in path.read_text().splitlines():
                key, sep, value = line.partition('=')
                value = value.strip().strip('\"\'')
                if sep and re.search(r'PASSWORD|SECRET|TOKEN|API_KEY', key, re.I) and len(value) >= 8:
                    values.append(value.encode())
    return values


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extra-secret-stdin', action='store_true', help='读取额外检查值，不写文件或打印值')
    args = parser.parse_args()
    values = local_values()
    if args.extra_secret_stdin:
        values.extend(value for value in sys.stdin.buffer.read().splitlines() if value)
    problems, seen = set(), set()
    paths = set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0')) - {b''}
    for raw in paths:
        name = raw.decode()
        if sensitive_path(name):
            problems.add(('working-tree/' + name, 'sensitive-file'))
        path = ROOT / name
        if path.is_file():
            for rule in scan_blob(path.read_bytes(), values):
                problems.add(('working-tree/' + name, rule))
    commits = git('rev-list', '--all').decode().splitlines()
    for commit in commits:
        for entry in git('ls-tree', '-r', '-z', commit).split(b'\0'):
            if not entry:
                continue
            meta, raw = entry.split(b'\t', 1)
            _, kind, oid = meta.split()
            name = raw.decode()
            if sensitive_path(name):
                problems.add(('history/' + name, 'sensitive-file'))
            if kind != b'blob' or oid in seen:
                continue
            seen.add(oid)
            for rule in scan_blob(git('cat-file', 'blob', oid.decode()), values):
                problems.add(('history/' + name, rule))
    if problems:
        for name, rule in sorted(problems):
            for value in values:
                name = name.replace(value.decode(errors='ignore'), '[REDACTED]')
            print(f'BLOCKED {name}: {rule}')
        return 1
    print(f'PASS: {len(paths)} files and {len(commits)} reachable commits checked; no matched sensitive files/values.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
