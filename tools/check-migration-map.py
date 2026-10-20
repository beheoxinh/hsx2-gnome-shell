#!/usr/bin/env python3
"""Validate the dconf migration table against the real schemas.

`migration-dry-run.js` proves the migration *runs*; it cannot prove the table
is still honest. A renamed key that later disappears from the target schema, or
a legacy key that nobody migrates any more, silently rots:

  * target key missing      -> the move writes into a key that does not exist
  * legacy key uncovered    -> users keep their old value and lose the setting
  * legacy schema unreferenced -> dead weight shipped in migrations/schemas
  * bad enum nickname       -> the migrated value is rejected by the schema

This gate parses migrations.js and the .gschema.xml files directly, so it needs
no dconf backend and no shell restart.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS = os.path.join(ROOT, 'migrations.js')
LEGACY_DIR = os.path.join(ROOT, 'migrations', 'schemas')

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


def collect_schemas():
    targets, legacy = {}, {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.endswith('.gschema.xml'):
                continue
            full = os.path.join(dirpath, name)
            schema_id = name[:-len('.gschema.xml')]
            if os.path.dirname(full) == LEGACY_DIR:
                legacy[schema_id] = os.path.join(full)
            else:
                targets[schema_id] = os.path.join(full)
    return targets, legacy


def parse_migration_table(text):
    """-> (rows, enum_nicks); rows are (from_schema, from_key, to_schema, to_key)."""
    body = re.search(r'const KEY_MOVES\s*=\s*\[(.*?)\n\];', text, re.S)
    if not body:
        return None, None
    body = re.sub(r'//[^\n]*', '', body.group(1))
    rows = re.findall(
        r"\[\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'"
        r"(?:\s*,\s*[^\]\s]+)?\s*\]", body, re.S)

    enum_body = re.search(r'const ENUM_NICKS\s*=\s*\{(.*?)\n\};', text, re.S)
    nicks = {}
    if enum_body:
        for key, values in re.findall(
                r"'([^']+)'\s*:\s*\[([^\]]*)\]", enum_body.group(1)):
            nicks[key] = re.findall(r"'([^']+)'", values)
    return rows, nicks


def main():
    text = read(MIGRATIONS)
    rows, nicks = parse_migration_table(text)
    if rows is None:
        print('could not find KEY_MOVES in migrations.js')
        return 1

    targets, legacy = collect_schemas()
    target_keys = {sid: parse_schema(p) for sid, p in targets.items()}
    legacy_keys = {sid: parse_schema(p) for sid, p in legacy.items()}

    problems = []

    if not rows:
        problems.append('KEY_MOVES is empty')

    used_legacy = set()
    covered = {}
    for from_id, from_key, to_id, to_key in rows:
        used_legacy.add(from_id)
        covered.setdefault(from_id, set()).add(from_key)

        keys = target_keys.get(to_id)
        if keys is None:
            problems.append('target schema %s does not exist (key %s)' % (to_id, to_key))
        elif to_key not in keys:
            problems.append('target key %s.%s does not exist' % (to_id, to_key))

        src = legacy_keys.get(from_id)
        if src is None:
            problems.append('legacy schema %s missing under migrations/schemas' % from_id)
        elif from_key not in src:
            problems.append('source key %s.%s not in the legacy schema' % (from_id, from_key))

        choices = keys.get(to_key) if keys else None
        if choices and to_key in nicks:
            for nick in nicks[to_key]:
                if nick not in choices:
                    problems.append('enum nickname %s rejected by %s' % (nick, to_key))

    for sid, keys in legacy_keys.items():
        if sid not in used_legacy:
            problems.append('legacy schema %s is never referenced by KEY_MOVES' % sid)
            continue
        for key in sorted(keys):
            if key not in covered.get(sid, set()):
                problems.append('legacy key %s.%s is never migrated' % (sid, key))

    for key in sorted(nicks):
        if not any(key in keys for keys in target_keys.values()):
            problems.append('ENUM_NICKS key %s is not in any schema' % key)

    if problems:
        print('migration table does not match the schemas:')
        for problem in problems:
            print('  ' + problem)
        print('\n%d problem(s) over %d KEY_MOVES row(s)' % (len(problems), len(rows)))
        return 1

    print('migration table matches %d legacy key(s) across %d schema(s)'
          % (sum(len(k) for k in legacy_keys.values()), len(legacy_keys)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
