#!/usr/bin/env python3
"""Strict offline integrity manifest and safe archive inspection for NexusNode DR."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tarfile

MANDATORY = (
    'db.dump',
    'app_data/.system_secrets.json',
    'host_secrets/encryption_key',
    'host_secrets/postgres_password',
    'host_config/.env',
)
MAX_FILES = 500_000
MAX_BYTES = 500 * 1024 ** 3


def safe_path(name):
    path = PurePosixPath(name)
    if (not name or name.startswith('/') or '\\' in name or '\x00' in name
            or any(part in ('', '.', '..') for part in name.split('/'))
            or any(part in ('', '.', '..') for part in path.parts)):
        raise ValueError('unsafe archive member path')
    if path.parts[0] not in ('db.dump', 'app_data', 'legacy', 'host_secrets', 'host_config', 'manifest.json'):
        raise ValueError('unexpected archive root')
    return name


def hash_stream(stream):
    h = hashlib.sha256()
    n = 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        n += len(chunk)
        h.update(chunk)
    return h.hexdigest(), n


def manifest(stage, metadata):
    stage = Path(stage).resolve()
    if not stage.is_dir():
        raise ValueError('stage not found')
    files = {}
    for path in sorted(stage.rglob('*')):
        rel = path.relative_to(stage).as_posix()
        safe_path(rel)
        if path.is_symlink() or (not path.is_file() and not path.is_dir()):
            raise ValueError('symlinks and special files are prohibited')
        if path.is_file():
            if rel == 'manifest.json':
                raise ValueError('manifest already exists')
            with path.open('rb') as f:
                digest, size = hash_stream(f)
            files[rel] = {'sha256': digest, 'size': size}
    if not set(MANDATORY).issubset(files):
        raise ValueError('mandatory recovery files missing: ' + ', '.join(sorted(set(MANDATORY) - set(files))))
    key = (stage / 'host_secrets/encryption_key').read_text().strip()
    if not re.fullmatch('[0-9a-fA-F]{64}', key):
        raise ValueError('invalid root encryption key format')
    vault = json.loads((stage / 'app_data/.system_secrets.json').read_text())
    if not isinstance(vault.get('secrets'), dict):
        raise ValueError('invalid vault structure')
    m = {'format': 'nexusnode-dr-v1', 'created_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
         'metadata': metadata, 'files': files}
    (stage / 'manifest.json').write_text(json.dumps(m, sort_keys=True, indent=2) + '\n')
    os.chmod(stage / 'manifest.json', 0o600)
    return m


def verify_archive(archive, output=None, max_bytes=MAX_BYTES):
    # Check every member and every content hash before writing a single output file.
    with tarfile.open(archive, 'r:gz') as tar:
        members = {}
        total = 0
        for member in tar:
            safe_path(member.name)
            if member.name in members:
                raise ValueError('duplicate archive member')
            if not (member.isfile() or member.isdir()):
                raise ValueError('archive links/devices are prohibited')
            if member.isfile():
                total += member.size
                if total > max_bytes:
                    raise ValueError('archive exceeds uncompressed size limit')
            members[member.name] = member
            if len(members) > MAX_FILES:
                raise ValueError('archive contains too many files')
        if 'manifest.json' not in members or not members['manifest.json'].isfile():
            raise ValueError('missing manifest.json')
        raw = tar.extractfile(members['manifest.json']).read(20 * 1024 * 1024 + 1)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError('manifest too large')
        m = json.loads(raw)
        if m.get('format') != 'nexusnode-dr-v1' or not isinstance(m.get('files'), dict):
            raise ValueError('unsupported manifest format')
        files = {p: member for p, member in members.items() if member.isfile() and p != 'manifest.json'}
        if set(files) != set(m['files']):
            raise ValueError('archive file inventory differs from manifest')
        if not set(MANDATORY).issubset(files):
            raise ValueError('required restore files missing')
        for name, member in files.items():
            entry = m['files'][name]
            with tar.extractfile(member) as stream:
                sha, size = hash_stream(stream)
            if sha != entry.get('sha256') or size != entry.get('size'):
                raise ValueError('file checksum/size mismatch: ' + name)
        if output:
            target = Path(output)
            if not target.is_dir() or any(target.iterdir()):
                raise ValueError('target must be an existing, empty isolated directory')
            for name, member in members.items():
                path = target.joinpath(*PurePosixPath(name).parts)
                if member.isdir():
                    path.mkdir(mode=0o700, parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                    with tar.extractfile(member) as source, path.open('xb') as dest:
                        while True:
                            chunk = source.read(1024 * 1024)
                            if not chunk:
                                break
                            dest.write(chunk)
                    os.chmod(path, 0o600)
        return m


def extract_raw_app_tar(archive, output):
    """Extract Docker app-data tar without accepting symlinks or traversal."""
    target = Path(output)
    if not target.is_dir() or any(target.iterdir()):
        raise ValueError('app_data destination must be an empty directory')
    with tarfile.open(archive, 'r:') as tar:
        seen = set()
        files = []
        total = 0
        for member in tar:
            name = member.name
            while name.startswith('./'):
                name = name[2:]
            if not name or name == '.':
                continue
            safe_path('app_data/' + name)
            if name in seen:
                raise ValueError('duplicate app-data member')
            seen.add(name)
            if not (member.isdir() or member.isfile()):
                raise ValueError('symlinks or special files in app-data')
            if member.isfile():
                total += member.size
                if total > MAX_BYTES:
                    raise ValueError('app-data exceeds size limit')
            files.append((name, member))
            if len(files) > MAX_FILES:
                raise ValueError('too many app-data files')
        for name, member in files:
            dest = target.joinpath(*PurePosixPath(name).parts)
            if member.isdir():
                dest.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with tar.extractfile(member) as src, dest.open('xb') as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        dst.write(chunk)
                os.chmod(dest, 0o600)
    return len(files)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('manifest', 'verify', 'extract-app'))
    parser.add_argument('path')
    parser.add_argument('--metadata-json', default='{}')
    parser.add_argument('--extract', default=None)
    args = parser.parse_args()
    try:
        if args.action == 'extract-app':
            if not args.extract:
                raise ValueError('--extract is required')
            count = extract_raw_app_tar(args.path, args.extract)
            print(f'DR app-data extract: OK ({count} entries)')
            return 0
        if args.action == 'manifest':
            m = manifest(args.path, json.loads(args.metadata_json))
        else:
            m = verify_archive(args.path, args.extract)
        print(f"DR archive {args.action}: OK ({len(m['files'])} files)")
    except (ValueError, OSError, tarfile.TarError, json.JSONDecodeError, KeyError) as exc:
        print(f'DR archive {args.action}: FAILED ({exc})', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
