#!/usr/bin/env python3
"""Remove the panel-domain keys, signal handlers and #apply methods from the
customizer module now that alienware-topbar owns them.

Line based on purpose: these files mix `foo() {` and `foo()\\n{` styles, and a
regex over the whole text silently ate newlines in the last attempt.

    python3 tools/strip-panel-from-gcm.py [--dry-run]
"""
import re
import sys

GCM_EXT = 'modules/alienware-gnome-customizer-manager@hsx2coder/extension.js'
GCM_MGR = 'modules/alienware-gnome-customizer-manager@hsx2coder/lib/Manager.js'
GCM_XML = ('modules/alienware-gnome-customizer-manager@hsx2coder/schemas/'
           'org.gnome.shell.extensions.gnome-customizer-manager.gschema.xml')

# keys that move to the alienware-topbar schema
MOVED_KEYS = [
    'quick-settings', 'quick-settings-dark-mode', 'quick-settings-night-light',
    'quick-settings-do-not-disturb', 'quick-settings-backlight',
    'quick-settings-airplane-mode', 'accent-color-icon',
    'max-displayed-search-results', 'invert-calendar-column-items',
    'window-preview-caption', 'window-preview-close-button',
]

# #apply* methods that only existed for the moved keys
MOVED_APPLY = [
    'QuickSettings', 'QSDarkMode', 'QSNightLight', 'QSDoNotDisturb',
    'QSBacklight', 'QSAirplaneMode', 'AccentColor', 'MaxSearchResults',
    'InvertCalendar', 'WinPreviewCaption', 'WinPreviewClose',
]

# Manager.js: keys whose handler disappears with them
MOVED_MANAGER_KEYS = [
    'window-preview-caption', 'window-preview-close-button',
    'alt-tab-small-icon-size',
]


def strip_lines(path, predicates, dry):
    lines = open(path, encoding='utf-8').read().splitlines(keepends=True)
    out = []
    i = 0
    dropped = []
    while i < len(lines):
        hit = None
        for label, test, kind in predicates:
            if test(lines, i):
                hit = (label, kind)
                break
        if hit is None:
            out.append(lines[i])
            i += 1
            continue
        label, kind = hit
        dropped.append(label)
        if kind == 'block':
            # consume the whole method: opening line + body + closing brace line
            depth = 0
            started = False
            while i < len(lines):
                depth += lines[i].count('{') - lines[i].count('}')
                started = True
                i += 1
                if started and depth <= 0:
                    break
            # swallow a trailing blank line
            if i < len(lines) and lines[i].strip() == '':
                i += 1
        else:
            i += 1
    if dropped and not dry:
        open(path, 'w', encoding='utf-8').write(''.join(out))
    return dropped


def build_ext_predicates():
    preds = []
    for key in MOVED_KEYS:
        preds.append((
            f'signal {key}',
            lambda L, i, k=key: f"'changed::{k}'," in L[i],
            'line'))
    for name in MOVED_APPLY:
        preds.append((
            f'#apply{name}',
            lambda L, i, n=name: re.match(rf'\s*#apply{n}\(f\)\s*\{{?\s*$', L[i]) is not None,
            'block'))
        preds.append((
            f'call #apply{name}',
            lambda L, i, n=name: re.match(rf'\s*this\.#apply{n}\((true|false)\);\s*$', L[i]) is not None,
            'line'))
    return preds


def build_mgr_predicates():
    preds = []
    for key in MOVED_MANAGER_KEYS:
        preds.append((
            f'signal {key}',
            lambda L, i, k=key: f"'changed::{k}'," in L[i],
            'line'))
    # #applyAltTabSmallIconSize and friends are alt-tab domain
    for name in ('AltTabSmallIconSize',):
        preds.append((
            f'#apply{name}',
            lambda L, i, n=name: re.match(rf'\s*#apply{n}\(.*\)\s*\{{?\s*$', L[i]) is not None,
            'block'))
        preds.append((
            f'call #apply{name}',
            lambda L, i, n=name: re.match(rf'\s*this\.#apply{n}\((true|forceOriginal)\);\s*$', L[i]) is not None,
            'line'))
        preds.append((
            f'signal for {name}',
            lambda L, i, n=name: re.search(rf"'changed::[a-z-]+',\s*(\(\)\s*=>\s*)?this\.#apply{n}\(", L[i]) is not None,
            'line'))
    return preds


def main():
    dry = '--dry-run' in sys.argv
    for path, preds in ((GCM_EXT, build_ext_predicates()),
                        (GCM_MGR, build_mgr_predicates())):
        dropped = strip_lines(path, preds, dry)
        print(f'{path}: {len(dropped)} removals')
        for d in dropped:
            print(f'  - {d}')

    # schema keys
    text = open(GCM_XML, encoding='utf-8').read()
    for key in MOVED_KEYS:
        m = re.search(r'\n[ ]*<key\b[^>]*\bname="%s"[^>]*>.*?</key>' % re.escape(key), text, re.S)
        if m:
            text = text[:m.start()] + text[m.end():]
            print(f'  - key {key}')
        else:
            print(f'  WARN key {key} not in schema')
    if not dry:
        open(GCM_XML, 'w', encoding='utf-8').write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
