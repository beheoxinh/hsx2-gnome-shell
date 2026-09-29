#!/usr/bin/env python3
"""Remove import bindings that check-unused-imports.py reports as unused.

Drops the whole import line when nothing from it is used, otherwise drops just
the unused names from the `{...}` list. `prefs.js` importing a `moduleEntryURL`
that modules.js no longer exports is the reason this exists: an ESM import of a
missing named export is a link-time failure, so the whole preferences window
would die, and nothing in the file even mentioned the symbol.

    python3 tools/remove-unused-imports.py [--dry-run]
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def unused_list():
    out = subprocess.run([sys.executable, 'tools/check-unused-imports.py'],
                         capture_output=True, text=True).stdout
    found = {}
    for line in out.splitlines():
        m = re.match(r'\s+(\S+): imports (?:\{(\w+)\}|(\w+)) from ', line)
        if not m:
            continue
        path = m.group(1)
        name = m.group(2) or m.group(3)
        found.setdefault(path, set()).add(name)
    return found


def drop_named(text, spec, names):
    def repl(m):
        kept = [n.strip() for n in m.group(1).split(',')
                if (n.strip().split(' as ')[-1].strip()) not in names]
        if not kept:
            return ''
        return 'import {%s} from %s;' % (', '.join(kept), repr(spec).replace("'", "'"))
    pattern = re.compile(r"import \{([^}]+)\} from ['\"]" + re.escape(spec) + r"['\"];")
    return pattern.sub(repl, text)


def main():
    dry = '--dry-run' in sys.argv
    for path, names in unused_list().items():
        text = open(path, encoding='utf-8').read()
        original = text
        for name in sorted(names):
            # named import first
            if re.search(r"import \{[^}]*\b%s\b[^}]*\} from ['\"]([^'\"]+)['\"]" % re.escape(name), text):
                spec = re.search(
                    r"import \{[^}]*\b%s\b[^}]*\} from ['\"]([^'\"]+)['\"]" % re.escape(name),
                    text).group(1)
                text = drop_named(text, spec, {name})
                continue
            # default / namespace import
            text = re.sub(
                r"^import\s+%s\s+from\s+['\"][^'\"]+['\"];?\n" % re.escape(name),
                '', text, flags=re.M)
            text = re.sub(
                r"^import\s+\*\s+as\s+%s\s+from\s+['\"][^'\"]+['\"];?\n" % re.escape(name),
                '', text, flags=re.M)
        # collapse the blank line left behind
        text = re.sub(r'\n\n\n+', '\n\n', text)
        if text != original:
            print(f'{path}: -{len(names)}')
            if not dry:
                open(path, 'w', encoding='utf-8').write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
