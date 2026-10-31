"""Check local Markdown/HTML links against files included in the public source."""
import argparse
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FENCES = re.compile(r'(?ms)^\s*(`{3,}|~{3,})[^\n]*\n.*?^\s*\1\s*$')
LINKS = re.compile(r'!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["\'][^\n]*?["\'])?\s*\)')
ATTRS = re.compile(r'\b(?:src|href)\s*=\s*["\']([^"\']+)["\']', re.I)
REFERENCES = re.compile(r'^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?', re.M)


def source_files(root):
    data = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root)
    return {Path(raw.decode()).as_posix() for raw in data.split(b'\0') if raw}


def anchors(text):
    text = FENCES.sub('', text)
    result = set(re.findall(r'\b(?:id|name)=["\']([^"\']+)["\']', text))
    counts = {}
    for heading in re.findall(r'^\s{0,3}#{1,6}\s+(.+?)\s*#*$', text, re.M):
        heading = re.sub(r'<[^>]+>', '', heading).replace('`', '')
        slug = re.sub(r'[^\w\-\s]', '', heading.lower()).strip()
        slug = re.sub(r'\s', '-', slug)
        number = counts.get(slug, 0)
        counts[slug] = number + 1
        result.add(slug + (f'-{number}' if number else ''))
    return result


def check(root):
    root = root.resolve()
    public = source_files(root)
    errors, count = [], 0
    for name in sorted(public):
        path = root / name
        if path.suffix not in {'.md', '.html'} or not path.is_file():
            continue
        if path.suffix == '.html' and not name.startswith('docs/'):
            continue  # Application URLs are resolved by Vite/Caddy, not Markdown.
        if not path.resolve().is_relative_to(root):
            errors.append((name, 'source leaves repository'))
            continue
        text = path.read_text()
        body = FENCES.sub('', text)
        targets = [a or b for a, b in LINKS.findall(body)] + ATTRS.findall(body) + REFERENCES.findall(body)
        for target in targets:
            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc or target.startswith('//'):
                continue
            count += 1
            candidate = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            if not candidate.is_relative_to(root):
                errors.append((name, 'link leaves repository'))
                continue
            relative = candidate.relative_to(root).as_posix()
            if relative not in public or not candidate.is_file():
                errors.append((name, f'missing public target: {target}'))
                continue
            if parsed.fragment and candidate.suffix == '.md':
                if unquote(parsed.fragment) not in anchors(candidate.read_text()):
                    errors.append((name, f'missing heading: {target}'))
    return count, errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    count, errors = check(args.root)
    for name, reason in errors:
        print(f'BROKEN {name}: {reason}')
    if errors:
        return 1
    print(f'PASS: {count} local documentation links and image references resolve in public source.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
