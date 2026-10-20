#!/usr/bin/env python3
"""Ban GNOME-3 era Shell APIs from in-process JS.

`node --check` only parses a file: it cannot see that `imports.gi.*`,
`global.log` and `lookupByUUID` do not exist in a GNOME 45+ Shell ESM module.
Such calls throw only when the code path runs, so nothing else in tools/ can
catch them.

In-process code (extension.js / prefs.js and everything they import) must use
the ESM forms:

    import Gio from 'gi://Gio';                         // not imports.gi.Gio
    console.log(...) / log(...)                         // not global.log(...)
    import {gettext as _} from
      'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

Exceptions (tools/legacy-shell-api-allow.txt) are out-of-process gjs helpers
where `imports.gi` IS the correct API.
"""
import fnmatch
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALLOW_FILE = os.path.join(ROOT, 'tools', 'legacy-shell-api-allow.txt')

SKIP_DIRS = {'.git', '.bak', '__pycache__', 'node_modules', '.codegraph', '.serena'}

RULES = [
    (re.compile(r'\bimports\.gi\b'),
     "imports.gi is GNOME 3 only - use `import X from 'gi://X'`"),
    (re.compile(r'\bglobal\.log\b'),
     'global.log() does not exist - use console.log()'),
    (re.compile(r'\bglobal\.logError\b'),
     'global.logError() does not exist - use logError()'),
    (re.compile(r'\blookupByUUID\s*\('),
     'lookupByUUID() is GNOME 3 only - import gettext from the prefs.js resource'),
    (re.compile(r'\bimports\.(?:misc|ui|main|gettext|package)\b'),
     'legacy imports.* module - use the ESM resource / gi:// import'),
    (re.compile(r'\bMainloop\b'),
     'Mainloop does not exist in GNOME Shell ESM - use GLib.MainLoop'),
]


def allow_patterns():
    if not os.path.exists(ALLOW_FILE):
        return []
    out = []
    with open(ALLOW_FILE, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.split('#', 1)[0].strip()
            if line:
                out.append(line)
    return out


def main():
    allowed = allow_patterns()
    hits = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        if os.path.relpath(dirpath, ROOT) == 'tools':
            continue
        for name in filenames:
            if not name.endswith('.js'):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, ROOT)
            if any(fnmatch.fnmatch(rel, pat) for pat in allowed):
                continue
            with open(full, encoding='utf-8', errors='replace') as fh:
                for lineno, line in enumerate(fh, 1):
                    code = line.split('//', 1)[0]
                    for rx, msg in RULES:
                        if rx.search(code):
                            hits.append('%s:%d: %s' % (rel, lineno, msg))
                            break

    if hits:
        print('legacy shell API found in in-process JS:')
        for hit in hits:
            print('  ' + hit)
        print('\n%d hit(s). Fix the call, or list the path in '
              'tools/legacy-shell-api-allow.txt' % len(hits))
        return 1

    print('no legacy shell API in in-process JS')
    return 0


if __name__ == '__main__':
    sys.exit(main())
