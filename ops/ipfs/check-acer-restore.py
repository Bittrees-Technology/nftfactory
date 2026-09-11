#!/usr/bin/python3
"""Restore the latest backup into a new, isolated database; never reset production."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

os.environ['PATH'] = '/usr/sbin:/usr/bin:/sbin:/bin'
assert os.geteuid() == 0, 'Run with administrator access.'
started = time.monotonic()
target = 'nftfactory_restore_' + uuid.uuid4().hex[:16]
created = False

def postgres(*args):
    return subprocess.check_output(['runuser', '-u', 'postgres', '--', *args])

def digest_database(database):
    tables = postgres('psql', '-XAt', '-d', database, '-c',
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").decode().splitlines()
    result = {}
    for table in tables:
        quoted = '"' + table.replace('"', '""') + '"'
        rows = postgres('psql', '-XAt', '-d', database, '-c',
            f'SELECT row_to_json(t)::text FROM public.{quoted} t ORDER BY row_to_json(t)::text')
        result[table] = hashlib.sha256(rows).hexdigest()
    return result

# Briefly stop only NFTFactory's API so DB and profile comparisons are stable.
was_active = subprocess.run(['systemctl', 'is-active', '--quiet', 'nftfactory-indexer']).returncode == 0
try:
    if was_active:
        subprocess.run(['systemctl', 'stop', 'nftfactory-indexer'], check=True)
    subprocess.run(['/usr/local/sbin/nftfactory-indexer-backup'], check=True)
    backups = sorted(Path('/var/backups/nftfactory-indexer').glob('20*T*Z'))
    backup = backups[-1]
    subprocess.run(['sha256sum', '--check', 'SHA256SUMS'], cwd=backup, check=True)
    source = digest_database('nftfactory_app')
    postgres('createdb', target)
    created = True
    # stdin avoids granting the database user access to the private backup directory.
    with (backup / 'database.dump').open('rb') as stream:
        subprocess.run(['runuser', '-u', 'postgres', '--', 'pg_restore',
                        '--exit-on-error', '--no-owner', '--no-privileges', '-d', target],
                       stdin=stream, check=True)
    assert digest_database(target) == source, 'Restored database content differs.'
    with tempfile.TemporaryDirectory(prefix='nftfactory-restore-') as directory:
        subprocess.run(['tar', '-xzf', str(backup / 'profile-files.tar.gz'), '-C', directory], check=True)
        original = Path('/var/lib/nftfactory-indexer/data')
        restored = Path(directory) / 'data'
        def hashes(root):
            return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in root.rglob('*') if p.is_file()}
        files = hashes(original)
        assert hashes(restored) == files, 'Restored profile files differ.'
    receipt = {'ok': True, 'databaseTablesCompared': len(source),
               'profileFilesCompared': len(files), 'backup': backup.name,
               'elapsedSeconds': round(time.monotonic() - started, 2)}
    path = Path('/var/backups/nftfactory-indexer/restore-check.json')
    path.write_text(json.dumps(receipt) + '\n')
    path.chmod(0o600)
    print(json.dumps(receipt))
finally:
    try:
        if created:
            postgres('dropdb', target)
    finally:
        if was_active:
            subprocess.run(['systemctl', 'start', 'nftfactory-indexer'], check=True)
