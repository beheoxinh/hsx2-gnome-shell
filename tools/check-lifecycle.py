#!/usr/bin/env python3
"""Flag connect/disconnect asymmetry and leftover debug logging.

Two things this refactor made easy to get wrong and that no existing check
looks at:
  * a signal connected in enable()/start() with no matching disconnect in
    disable()/stop() leaks a handler every time the module is toggled
  * console.log in a code path that runs per signal or per frame turns into
    journal spam; log()/logError() are the shell-native way

Only reports, never edits.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

LIFECYCLE = re.compile(r'\b(enable|disable|start|stop)\s*\(')
CONNECT = re.compile(r"\.connect(?:Object)?\s*\(")
DISCONNECT = re.compile(r"\.disconnect(?:Object)?\s*\(")

problems = []
logging = []

for path in sorted(glob.glob('modules/**/*.js', recursive=True)
                   + ['extension.js', 'prefs.js', 'migrations.js']):
    text = open(path, encoding='utf-8', errors='replace').read()
    lines = text.splitlines()

    n_connect = len(CONNECT.findall(text))
    n_disconnect = len(DISCONNECT.findall(text))
    if n_connect and not n_disconnect and re.search(r'disable\s*\(\s*\)\s*\{|stop\s*\(\s*\)\s*\{', text):
        problems.append(f'{path}: {n_connect} connect() call(s) and no disconnect() anywhere')

    for n, line in enumerate(lines, 1):
        if 'console.log' in line:
            logging.append(f'{path}:{n}: console.log  {line.strip()[:70]}')
        elif 'console.warn' in line or 'console.error' in line:
            logging.append(f'{path}:{n}: console.warn {line.strip()[:70]}')

if problems:
    print(f'connect/disconnect asymmetry: {len(problems)}\n')
    for p in problems:
        print(f'  {p}')
    print()

print(f'debug logging left: {len(logging)}')
for p in logging:
    print(f'  {p}')

if '--strict' in sys.argv and (problems or logging):
    sys.exit(1)
