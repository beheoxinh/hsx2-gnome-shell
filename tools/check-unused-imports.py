#!/usr/bin/env python3
"""Report imports that no longer resolve to a use in the same file.

The refactor moved methods between modules, which is exactly when an import is
left behind: the symbol is still imported but nothing in the file mentions it.
Only the default/namespace binding of each import is checked, and only for
`./` and `../` specifiers, because gi:// and resource:// names are used less
predictably (and are cheap).
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []

DEFAULT = re.compile(r"import\s+(?:\*\s+as\s+)?(\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s+'([^']+)'")
NAMED = re.compile(r"import\s+\{([^}]+)\}\s*from\s+'([^']+)'")

for path in sorted(glob.glob('**/*.js', recursive=True)):
    if path.startswith(('.git/', '.bak/')) or path.startswith('tools/'):
        continue
    text = open(path, encoding='utf-8', errors='replace').read()
    body = '\n'.join(l for l in text.splitlines()
                     if not l.lstrip().startswith('import '))

    for m in DEFAULT.finditer(text):
        name, spec = m.group(1), m.group(2)
        if name in ('default',):
            continue
        if not re.search(r'\b' + re.escape(name) + r'\b', body):
            problems.append(f'{path}: imports {name} from {spec} but never uses it')

    for m in NAMED.finditer(text):
        spec = m.group(2)
        for raw in m.group(1).split(','):
            raw = raw.strip()
            if not raw or ' as ' in raw:
                raw = raw.split(' as ')[-1].strip()
            name = raw.strip()
            if not name or name == 'default':
                continue
            if not re.search(r'\b' + re.escape(name) + r'\b', body):
                problems.append(f'{path}: imports {{{name}}} from {spec} but never uses it')

if problems:
    print(f'FAIL: {len(problems)} unused import(s)\n')
    for p in problems:
        print(f'  {p}')
    sys.exit(1)

print('OK: no unused imports')
