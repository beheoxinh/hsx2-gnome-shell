#!/usr/bin/env python3
"""Verify named imports from GNOME Shell resources really exist.

`node --check` only parses a file, so it happily accepts

    import Config from 'resource:///org/gnome/shell/misc/config.js';

and the shell then refuses to load the extension at all:

    SyntaxError: The requested module '...' doesn't provide an export named: 'default'

A default import of a module with no default export, or a named import of a
binding the shell no longer exports, is a *link* error: it only appears in the
journal at login, never in a static check.

Ground truth is the installed shell's own gresource bundle, so this check asks
the real binary what it exports instead of trusting a hand-maintained list.
"""
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLES = [
    '/usr/lib64/gnome-shell/libshell-18.so',
    '/usr/lib/gnome-shell/libshell-18.so',
]
FROM_RE = re.compile(r"from\s+'(resource:///org/gnome/shell/[^']+)'\s*;")
EXPORT_RE = re.compile(
    r'^export\s+(?:default\s+|declare\s+)?'
    r'(?:(?:async\s+)?class|function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)', re.M)
EXPORT_DESTRUCTURE_RE = re.compile(r'^export\s+const\s*\{([^}]*)\}', re.M | re.S)


def find_bundle():
    for path in BUNDLES:
        if os.path.isfile(path):
            return path
    return None


def shell_exports(bundle, resource, cache):
    """Every name the shell module exports, plus whether it has a default."""
    if resource in cache:
        return cache[resource]
    result = subprocess.run(
        ['gresource', 'extract', bundle, resource[len('resource://'):]],
        capture_output=True, text=True, check=False)
    if result.returncode != 0:
        cache[resource] = None
        return None
    source = result.stdout
    names, has_default = set(), False
    if re.search(r'^export\s+default\b', source, re.M):
        has_default = True
    for match in EXPORT_RE.finditer(source):
        names.add(match.group(1))
    # `export const {\n  a, b,\n} = ...` — the names live on their own lines
    for block in EXPORT_DESTRUCTURE_RE.findall(source):
        for part in block.split(','):
            part = part.strip()
            if not part or part.startswith(('//', '/*', '*')):
                continue
            names.add(part.split(':')[0].strip().split('=')[0].strip())
    cache[resource] = (names, has_default)
    return cache[resource]


def main():
    bundle = find_bundle()
    if bundle is None:
        print('SKIP: no gnome-shell gresource bundle found')
        return 0

    cache, problems, checked = {}, [], 0
    files = []
    for root, _, names in os.walk(os.path.join(REPO, 'modules')):
        files += [os.path.join(root, n) for n in names if n.endswith('.js')]
    files += [os.path.join(REPO, n) for n in ('extension.js', 'prefs.js')]

    for path in files:
        try:
            source = open(path, encoding='utf-8').read()
        except OSError:
            continue
        for match in FROM_RE.finditer(source):
            resource = match.group(1)
            info = shell_exports(bundle, resource, cache)
            if info is None:
                continue
            names, has_default = info
            start = source.rfind('import', 0, match.start())
            if start < 0:
                continue
            clause = source[start + len('import'):match.start()].strip()
            line = source[:start].count('\n') + 1
            rel = os.path.relpath(path, REPO)
            checked += 1

            if clause.startswith('*'):
                continue
            if clause.startswith('{'):
                wanted = re.findall(
                    r'([A-Za-z_$][\w$]*)\s*(?:as\s+[A-Za-z_$][\w$]*)?', clause[1:])
                for name in wanted:
                    if name in names:
                        continue
                    # a shell binding may also be re-exported; only flag when
                    # the resource genuinely has no such export
                    problems.append(
                        f'{rel}:{line} imports named {{{name}}} from {resource} '
                        f'but the shell does not export it')
            elif clause:
                if not has_default:
                    problems.append(
                        f'{rel}:{line} default-imports {clause.split()[0]} from '
                        f'{resource} which has no default export')

    if problems:
        print(f'FAIL: {len(problems)} unresolvable shell import(s)\n')
        for problem in sorted(set(problems)):
            print(f'  {problem}')
        return 1

    print(f'OK: {checked} shell-resource import(s) resolve against the installed '
          f'gnome-shell ({len(cache)} modules)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
