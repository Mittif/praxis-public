"""Build a checked public-source ZIP, without Git history or local question data."""
import argparse
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.check_secrets import local_values, scan_blob, sensitive_path

PRIVATE_DIRECTORIES = {'.git', '.aws', '.ssh', '.codex', '.direnv', '.venv', 'venv', 'node_modules', '__pycache__',
                       'backups', 'dumps', 'exports', 'secrets', 'credentials', 'tmp',
                       'test-results', 'playwright-report', 'blob-report', 'dist', 'build', 'logs'}


def private_content(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        return True
    if any(part in PRIVATE_DIRECTORIES for part in path.parts) or path.parts[0] == '题库':
        return True
    if path.parts[0] == 'data' and name not in {'data/README.md', 'data/assets/.gitkeep'}:
        return True
    return (sensitive_path(name)
            or path.name in {'.envrc', '.git-credentials', '.gitconfig', 'id_ecdsa', 'id_dsa'}
            or path.suffix.lower() in {'.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.jks', '.keystore'})


def build_public_archive(root, target, private_values=()):
    root, target = Path(root).resolve(), Path(target)
    if target.suffix.lower() != '.zip' or target.is_symlink():
        raise ValueError('输出必须是普通 .zip 路径。')
    candidates = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root)
    payload = {}
    for raw in sorted(set(candidates.split(b'\0')) - {b''}):
        name = raw.decode('utf-8')
        path = root / name
        if private_content(name):
            raise ValueError(f'文件不允许公开：{name}；请先取消其 Git 跟踪并保留本地文件。')
        # lstat on the leaf alone follows symlinked parent directories. Reject
        # every component before opening anything outside the checked worktree.
        component = root
        for part in PurePosixPath(name).parts:
            component /= part
            if component.is_symlink():
                raise ValueError(f'拒绝打包符号链接或符号链接目录：{name}')
        if not path.exists() and not path.is_symlink():
            continue
        mode = path.lstat().st_mode
        if not stat.S_ISREG(mode):
            raise ValueError(f'拒绝打包符号链接或特殊文件：{name}')
        body = path.read_bytes()
        if scan_blob(body, private_values):
            raise ValueError(f'发现匹配的敏感内容，未生成上传包：{name}')
        payload[name] = (body, 0o755 if mode & stat.S_IXUSR else 0o644)
    if not payload:
        raise ValueError('没有可公开的项目文件。')
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.public-', suffix='.zip.tmp', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as handle:
            with zipfile.ZipFile(handle, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name, (body, mode) in payload.items():
                    item = zipfile.ZipInfo('praxis/' + name, date_time=(1980, 1, 1, 0, 0, 0))
                    item.create_system = 3
                    item.external_attr = (stat.S_IFREG | mode) << 16
                    item.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(item, body)
        with zipfile.ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert set(archive.namelist()) == {'praxis/' + name for name in payload}
            for name, (body, _) in payload.items():
                assert archive.read('praxis/' + name) == body
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return len(payload)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'tmp/public/praxis-github-public.zip')
    args = parser.parse_args()
    try:
        count = build_public_archive(ROOT, args.output, local_values())
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, str(error) + '\n')
    print(f'公开源码包已生成：{args.output}\n共 {count} 个文件；不含旧 Git 历史、第三方题库、运行数据或实例配置。')


if __name__ == '__main__':
    main()
