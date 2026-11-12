#!/usr/bin/env python3
"""Validate the dconf migration table against the real schemas.

`migration-dry-run.js` proves the migration *runs*; it cannot prove the table
is still honest. A renamed key that later disappears from the target schema, or
a legacy key that nobody migrates any more, silently rots:

  * target key missing      -> the move writes into a key that does not exist
  * legacy key uncovered    -> users keep their old value and lose the setting
  * legacy schema unreferenced -> dead weight shipped in migrations/schemas*
  * bad enum nickname       -> the migrated value is rejected by the schema

This gate parses migrations.js and the .gschema.xml files directly, so it needs
no dconf backend and no shell restart.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(ROOT, 'migrations.js')
MIGRATIONS_DIR = os.path.join(ROOT, 'migrations')
# each migration table and the frozen schema dir its source keys live in
TABLES = [
    ('KEY_MOVES', os.path.join(MIGRATIONS_DIR, 'schemas')),
    ('KEY_MOVES_V2', os.path.join(MIGRATIONS_DIR, 'schemas-v2')),
]

SKIP_DIRS = {'.git', '.bak', '__pycache__', 'node_modules', '.codegraph', '.serena'}

KEY_RX = re.compile(r'<key[^>]*\bname="([^"]+)"')
CHILD_RX = re.compile(r'<child[^>]*\bname="([^"]+)"')
CHOICE_RX = re.compile(r"<choice\s+value=['\"]([^'\"]+)['\"]")


def read(path):
    with open(path, encoding='utf-8', errors='replace') as fh:
        return fh.read()


def parse_schema(path):
    """{key_name: frozenset(valid enum choices)}"""
    text = read(path)
    keys = {}
    for name in CHILD_RX.findall(text):
        keys.setdefault(name, frozenset())
    for match in re.finditer(r'<key[^>]*\bname="([^"]+)"[^>]*>(.*?)</key>', text, re.S):
        name, body = match.group(1), match.group(2)
        keys[name] = frozenset(CHOICE_RX.findall(body))
    for name in KEY_RX.findall(text):
        keys.setdefault(name, frozenset())
    return keys


def collect_targets():
    """live schemas: everything outside migrations/"""
    targets = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if os.path.abspath(dirpath) == MIGRATIONS_DIR:
            dirnames[:] = []
            continue
        for name in filenames:
            if name.endswith('.gschema.xml'):
                targets[name[:-len('.gschema.xml')]] = os.path.join(dirpath, name)
    return targets


def collect_legacy(legacy_dir):
    legacy = {}
    if os.path.isdir(legacy_dir):
        for name in os.listdir(legacy_dir):
            if name.endswith('.gschema.xml'):
                legacy[name[:-len('.gschema.xml')]] = os.path.join(legacy_dir, name)
    return legacy


def parse_table(text, name):
    """rows (from_schema, from_key, to_schema, to_key) of one table, or None"""
    body = re.search(r'const %s\s*=\s*\[(.*?)\n\];' % re.escape(name), text, re.S)
    if not body:
        return None
    body = re.sub(r'//[^\n]*', '', body.group(1))
    return re.findall(
        r"\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'"
        r"(?:\s*,\s*[^\]\s]+)?\s*\]", body, re.S)


def parse_enum_nicks(text):
    enum_body = re.search(r'const ENUM_NICKS\s*=\s*\{(.*?)\n\};', text, re.S)
    nicks = {}
    if enum_body:
        for key, values in re.findall(
                r"'([^']+)'\s*:\s*\[([^\]]*)\]", enum_body.group(1)):
            nicks[key] = re.findall(r"'([^']+)'", values)
    return nicks


def check_table(name, rows, legacy_dir, target_keys, nicks, problems):
    rel = os.path.relpath(legacy_dir, ROOT)
    legacy_keys = {sid: parse_schema(p) for sid, p in collect_legacy(legacy_dir).items()}

    if not rows:
        problems.append('%s is empty' % name)

    used_legacy = set()
    covered = {}
    for from_id, from_key, to_id, to_key in rows:
        used_legacy.add(from_id)
        covered.setdefault(from_id, set()).add(from_key)

        keys = target_keys.get(to_id)
        if keys is None:
            problems.append('%s: target schema %s does not exist (key %s)' % (name, to_id, to_key))
        elif to_key not in keys:
            problems.append('%s: target key %s.%s does not exist' % (name, to_id, to_key))

        src = legacy_keys.get(from_id)
        if src is None:
            problems.append('%s: legacy schema %s missing under %s' % (name, from_id, rel))
        elif from_key not in src:
            problems.append('%s: source key %s.%s not in the legacy schema' % (name, from_id, from_key))

        choices = keys.get(to_key) if keys else None
        if choices and to_key in nicks:
            for nick in nicks[to_key]:
                if nick not in choices:
                    problems.append('%s: enum nickname %s rejected by %s' % (name, nick, to_key))

    for sid, keys in legacy_keys.items():
        if sid not in used_legacy:
            problems.append('%s: legacy schema %s is never referenced' % (name, sid))
            continue
        for key in sorted(keys):
            if key not in covered.get(sid, set()):
                problems.append('%s: legacy key %s.%s is never migrated' % (name, sid, key))

    return sum(len(k) for k in legacy_keys.values()), len(legacy_keys)


def main():
    text = read(MIGRATIONS)
    nicks = parse_enum_nicks(text)
    target_keys = {sid: parse_schema(p) for sid, p in collect_targets().items()}

    problems = []
    total_rows = total_keys = total_schemas = 0
    for name, legacy_dir in TABLES:
        rows = parse_table(text, name)
        if rows is None:
            problems.append('could not find %s in migrations.js' % name)
            continue
        k, n = check_table(name, rows, legacy_dir, target_keys, nicks, problems)
        total_rows += len(rows)
        total_keys += k
        total_schemas += n

    for key in sorted(nicks):
        if not any(key in keys for keys in target_keys.values()):
            problems.append('ENUM_NICKS key %s is not in any schema' % key)

    if problems:
        print('migration table does not match the schemas:')
        for problem in problems:
            print('  ' + problem)
        print('\n%d problem(s) over %d migration row(s)' % (len(problems), total_rows))
        return 1

    print('migration tables match %d legacy key(s) across %d schema(s), %d row(s)'
          % (total_keys, total_schemas, total_rows))
    return 0


if __name__ == '__main__':
    sys.exit(main())
