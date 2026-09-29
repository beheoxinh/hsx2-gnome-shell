#!/usr/bin/env python3
"""Drop the panel-domain rows from the customizer preferences.

The keys moved to alienware-topbar, so leaving the rows here would bind to keys
the customizer schema no longer declares and throw when the window is opened.

    python3 tools/strip-panel-from-gcm-prefs.py [--dry-run]
"""
import re
import sys

PREFS = 'modules/alienware-gnome-customizer-manager@hsx2coder/prefs.js'

# widget fields that belonged to the moved keys
WIDGETS = [
    'quickSettingsMenu', 'quickSettingsDarkMode', 'quickSettingsNightLight',
    'quickSettingsDnd', 'quickSettingsBacklight', 'quickSettingsAirplane',
    'accentColorIcon', 'maxSearchResults', 'invertCalendar',
]

# groups that existed only to host those rows
GROUPS = ['quickSettings']


def main():
    dry = '--dry-run' in sys.argv
    lines = open(PREFS, encoding='utf-8').read().splitlines(keepends=True)
    out = []
    i = 0
    dropped = []
    while i < len(lines):
        line = lines[i]

        m = re.match(r'(\s*)this\.(\w+)\s*=\s*new Adw\.(\w+)\(\{', line)
        if m and (m.group(2) in WIDGETS or m.group(2) in GROUPS):
            indent = m.group(1)
            i += 1
            while i < len(lines) and lines[i].rstrip() not in (indent + '});', indent + '}'):
                i += 1
            i += 1
            if i < len(lines) and lines[i].strip() == '':
                i += 1
            dropped.append(f'{m.group(3).lower()} {m.group(2)}')
            continue

        m = re.match(r"\s*this\.schema\.bind\('([a-z0-9-]+)'", line)
        if m and m.group(1) not in _own_keys(PREFS):
            i += 1
            dropped.append(f'bind {m.group(1)}')
            continue

        out.append(line)
        i += 1

    print(f'{len(dropped)} removals')
    for d in dropped:
        print(f'  - {d}')
    if dropped and not dry:
        open(PREFS, 'w', encoding='utf-8').write(''.join(out))
    return 0


def _own_keys(prefs):
    import xml.etree.ElementTree as ET
    xml = ('modules/alienware-gnome-customizer-manager@hsx2coder/schemas/'
           'org.gnome.shell.extensions.gnome-customizer-manager.gschema.xml')
    return {k.get('name') for k in ET.parse(xml).getroot().iter('key')}


if __name__ == '__main__':
    sys.exit(main())
