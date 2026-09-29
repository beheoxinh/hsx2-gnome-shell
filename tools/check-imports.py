#!/usr/bin/env python3
"""Check that every named import resolves to a real export.

An ES module that imports a name the target does not export is a *link-time*
error: the whole module fails to instantiate, with no error until it is actually
loaded. `prefs.js` importing moduleEntryURL after that helper was deleted is
exactly this, and it killed the preferences window while every syntax check
passed.

Default imports are only checked for file existence (the class name a module
default-exports cannot be resolved by reading text).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []
SKIP = ('.git', '.bak', 'node_modules')

IMPORT = re.compile(
    r"^\s*import\s+(?:(?P<default>\w+)\s*,\s*)?(?:\{(?P<named>[^}]*)\}|\*\s+as\s+(?P<ns>\w+))?"
    r"\s*from\s+'(?P<spec>[^']+)';", re.M)


def walk():
    for base, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in SKIP]
        for f in files:
            if f.endswith('.js'):
                yield os.path.join(base, f)


def exports_of(path):
    text = open(path, encoding='utf-8', errors='replace').read()
    names = set()
    names |= set(re.findall(r"^export\s+(?:async\s+)?function\s+(\w+)", text, re.M))
    names |= set(re.findall(r"^export\s+class\s+(\w+)", text, re.M))
    names |= set(re.findall(r"^export\s+(?:const|let|var)\s+(\w+)", text, re.M))
    for m in re.finditer(r"^export\s*\{([^}]*)\}", text, re.M):
        for raw in m.group(1).split(','):
            raw = raw.strip()
            if raw:
                names.add(raw.split(' as ')[-1].strip())
    if re.search(r"^export\s+default\s", text, re.M):
        names.add('default')
    return names


cache = {}
for path in walk():
    text = open(path, encoding='utf-8', errors='replace').read()
    for m in IMPORT.finditer(text):
        spec = m.group('spec')
        if spec.startswith(('gi://', 'resource://', 'file://')):
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(path), spec))
        if not os.path.isfile(target):
            problems.append(f'{path}: import {spec} -> {target} does not exist')
            continue
        if target not in cache:
            cache[target] = exports_of(target)
        available = cache[target]
        named = m.group('named')
        if not named:
            continue
        for raw in named.split(','):
            raw = raw.strip()
            if not raw:
                continue
            name = raw.split(' as ')[0].strip()
            if name and name not in available:
                problems.append(
                    f'{path}: imports {{ {name} }} from {spec}, '
                    f'which does not export it')

if problems:
    print(f'FAIL: {len(problems)} unresolved import(s)\n')
    for p in problems:
        print(f'  {p}')
    sys.exit(1)

print(f'OK: every import in {len(cache)} modules resolves to a real export')
