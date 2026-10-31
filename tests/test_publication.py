import subprocess
import zipfile

import pytest

from scripts.init_demo_bank import demo_questions, write_demo_bank
from scripts.package_public import build_public_archive
from scripts.check_publication import audit_public_history


def repository(tmp_path, files):
    root = tmp_path / 'source'
    root.mkdir()
    subprocess.run(['git', 'init', '--quiet', str(root)], check=True)
    for name, content in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    subprocess.run(['git', 'add', '--force', '--all'], cwd=root, check=True)
    return root


def test_public_archive_contains_source_and_art_but_no_ignored_state(tmp_path):
    root = repository(tmp_path, {
        '.gitignore': b'.env\nnode_modules/\ntmp/\n', '.env.example': b'DB_PASSWORD=replace-me\n',
        'README.md': b'Public source', 'docs/assets/poster.png': b'demo-art', 'deploy.sh': b'#!/bin/sh\n',
    })
    (root / 'deploy.sh').chmod(0o755)
    (root / '.env').write_text('DB_PASSWORD=private-local-value')
    (root / 'tmp').mkdir()
    (root / 'tmp' / 'notes.txt').write_text('private scratch data')
    target = tmp_path / 'public.zip'
    assert build_public_archive(root, target) == 5
    with zipfile.ZipFile(target) as archive:
        assert set(archive.namelist()) == {
            'praxis/.gitignore', 'praxis/.env.example', 'praxis/README.md',
            'praxis/docs/assets/poster.png', 'praxis/deploy.sh',
        }
        assert archive.getinfo('praxis/deploy.sh').external_attr >> 16 & 0o111


@pytest.mark.parametrize('name', ['.env', '题库/private.pdf', 'data/questions.json', 'data/assets/page.png'])
def test_forced_tracked_private_files_block_export(tmp_path, name):
    root = repository(tmp_path, {name: b'private fixture'})
    target = tmp_path / 'blocked.zip'
    with pytest.raises(ValueError, match='不允许公开'):
        build_public_archive(root, target)
    assert not target.exists() and (root / name).read_bytes() == b'private fixture'


def test_export_rejects_local_secret_and_symlink_without_reading_target(tmp_path):
    secret = b'unique-local-secret-fixture'
    root = repository(tmp_path, {'README.md': b'header\n' + secret})
    target = tmp_path / 'blocked.zip'
    with pytest.raises(ValueError) as error:
        build_public_archive(root, target, [secret])
    assert secret.decode() not in str(error.value) and not target.exists()
    (root / 'README.md').unlink()
    (root / 'README.md').symlink_to(tmp_path / 'private-outside.txt')
    with pytest.raises(ValueError, match='符号链接'):
        build_public_archive(root, target)


def test_export_rejects_symlinked_parent_directory(tmp_path):
    root = repository(tmp_path, {'docs/guide.md': b'public guide'})
    (root / 'docs/guide.md').unlink()
    (root / 'docs').rmdir()
    outside = tmp_path / 'private-directory'
    outside.mkdir()
    (outside / 'guide.md').write_bytes(b'unrelated private notes')
    (root / 'docs').symlink_to(outside, target_is_directory=True)
    target = tmp_path / 'blocked.zip'
    with pytest.raises(ValueError, match='符号链接目录'):
        build_public_archive(root, target)
    assert not target.exists()


def commit(root, message):
    subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                    'commit', '--quiet', '-m', message], cwd=root, check=True)


def test_publication_detects_removed_private_content_in_history(tmp_path):
    root = repository(tmp_path, {'题库/restricted.pdf': b'self-authored private-history fixture'})
    commit(root, 'Private fixture')
    subprocess.run(['git', 'rm', '--quiet', '题库/restricted.pdf'], cwd=root, check=True)
    commit(root, 'Remove current copy')
    report = audit_public_history(root)
    assert report['current_private_paths'] == []
    assert report['historical_private_paths'] == ['题库/restricted.pdf']
    assert report['commits'] == 2


def test_clean_public_history_passes_without_bringing_local_runtime_data(tmp_path):
    root = repository(tmp_path, {'.gitignore': b'data/*\n', 'README.md': b'Public fixture'})
    commit(root, 'Public source')
    (root / 'data').mkdir()
    (root / 'data/questions.json').write_bytes(b'local fixture excluded from history')
    report = audit_public_history(root)
    assert report['commits'] == 1
    assert not any(report[key] for key in ('current_private_paths', 'historical_private_paths', 'historical_symlinks'))


def test_demo_bank_has_working_inventory_and_preserves_existing_private_bank(tmp_path):
    bank = demo_questions()
    assert len(bank) == 200 and len({q['id'] for q in bank}) == 200
    assert len({q['bank'] for q in bank}) == 4
    for question in bank:
        if question['multiple']:
            answer = [option['id'] for option in question['options'] if int(option['text']) % 2 == 0]
        else:
            expression = question['stem'].removeprefix('【自编演示题】').split(' 的')[0]
            total = sum(map(int, expression.split(' + ')))
            answer = [option['id'] for option in question['options'] if int(option['text']) == total]
        assert question['answer'] == answer
    path = tmp_path / 'data/questions.json'
    path.parent.mkdir()
    path.write_bytes(b'existing-private-bank')
    with pytest.raises(FileExistsError):
        write_demo_bank(path)
    assert path.read_bytes() == b'existing-private-bank'
