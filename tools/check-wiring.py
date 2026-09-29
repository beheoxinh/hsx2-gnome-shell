#!/usr/bin/env python3
"""Static wiring check for the suite: run this instead of a shell restart.

Verifies, without loading anything into GNOME Shell:
  * every MODULES entry has an extension class in the root CLASS_REGISTRY
  * every MODULES entry has a prefs class in the root PREFS_REGISTRY
  * every enableKey exists in the suite schema, and vice versa
  * every module directory has the files its entry declares
  * every uuid a module's metadata claims matches its directory name
  * every relative import in the repo resolves to a file that exists
  * no module writes the panel except through PanelHost
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []


def fail(msg):
    problems.append(msg)


modules_js = open('modules.js', encoding='utf-8').read()
ext_js = open('extension.js', encoding='utf-8').read()
prefs_js = open('prefs.js', encoding='utf-8').read()

# ── MODULES entries ──────────────────────────────────────────────────────
entries = []
for block in re.finditer(r'\{\n((?:.*?\n)*?)\s*\}', modules_js):
    body = block.group(1)
    if "key: '" not in body or 'uuid:' not in body:
        continue
    d = {}
    for k in ('key', 'enableKey', 'uuid', 'entry', 'prefsEntry'):
        m = re.search(rf"{k}: '([^']+)'", body)
        if m:
            d[k] = m.group(1)
    if len(d) >= 4:
        entries.append(d)

if not entries:
    fail('no MODULES entries parsed from modules.js')

suite_schema = ET.parse(
    'schemas/org.gnome.shell.extensions.alienware-suite.gschema.xml').getroot()
suite_keys = {k.get('name') for k in suite_schema.iter('key')}

for e in entries:
    uuid = e['uuid']
    mdir = os.path.join('modules', uuid)
    if not os.path.isdir(mdir):
        fail(f'{uuid}: modules/{uuid} does not exist')
        continue

    if f"'{uuid}':" not in ext_js:
        fail(f'{uuid}: missing from root extension.js CLASS_REGISTRY')
    if e.get('prefsEntry') and f"'{uuid}':" not in prefs_js:
        fail(f'{uuid}: declares prefsEntry but missing from root prefs.js PREFS_REGISTRY')
    if e['enableKey'] not in suite_keys:
        fail(f'{uuid}: enableKey {e["enableKey"]} not in suite schema')
    for key in ('entry', 'prefsEntry'):
        if e.get(key) and not os.path.isfile(os.path.join(mdir, e[key])):
            fail(f'{uuid}: {key} {e[key]} declared but missing')

    meta_path = os.path.join(mdir, 'metadata.json')
    if not os.path.isfile(meta_path):
        fail(f'{uuid}: no metadata.json')
    else:
        meta = json.load(open(meta_path, encoding='utf-8'))
        if meta.get('uuid') != uuid:
            fail(f'{uuid}: metadata.json uuid is {meta.get("uuid")!r}')

# every enable-* key has a module
registered = {e['enableKey'] for e in entries}
for key in sorted(suite_keys):
    if key.startswith('enable-') and key not in registered:
        fail(f'suite schema {key} has no module using it')

# ── imports resolve ──────────────────────────────────────────────────────
IMPORT = re.compile(r"^\s*(?:import|export)[^;'\"]*from\s+'([^']+)';", re.M)
js_files = []
for base, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('.git', '.bak')]
    for f in files:
        if f.endswith('.js'):
            js_files.append(os.path.join(base, f))

for path in js_files:
    text = open(path, encoding='utf-8', errors='replace').read()
    for spec in IMPORT.findall(text):
        if spec.startswith(('gi://', 'resource://', 'file://')):
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(path), spec))
        if not os.path.isfile(target):
            fail(f'{path}: import {spec} -> {target} does not exist')

# ── panel ownership ──────────────────────────────────────────────────────
# reads of statusArea are fine (e.g. Main.panel.statusArea.dateMenu._messageList);
# what must not happen outside the top bar module is a WRITE.
PANEL_WRITES = re.compile(
    r'Main\.panel\.(?:'
    r'addToStatusArea\s*\(|'
    r'_addToPanelBox\s*\(|'
    r'_onMenuSet\s*=|'
    r'set_height\s*\(|'
    r'height\s*=[^=]|'
    r'(?:_leftBox|_centerBox|_rightBox)\.(?:add_child|insert_child_at_index|'
    r'remove_child|remove_all|set_child|set_style)\s*\(|'
    r'statusArea\.[A-Za-z0-9_]+\s*=[^=]|'
    r'statusArea\[[^\]]+\]\s*=[^=]'
    r')')
ALLOWED_PANEL_MODULES = {'alienware-topbar@hsx2coder', 'alienware-dash-to-panel@hsx2coder'}
for path in js_files:
    rel = os.path.normpath(path)
    if not rel.startswith('modules/'):
        continue
    uuid = rel.split(os.sep)[1]
    if uuid in ALLOWED_PANEL_MODULES:
        continue
    text = open(path, encoding='utf-8', errors='replace').read()
    for n, line in enumerate(text.splitlines(), 1):
        if PANEL_WRITES.search(line) and not line.strip().startswith('//'):
            if 'PanelHost' in line:
                continue
            fail(f'{rel}:{n}: writes the panel directly, use PanelHost')
            break

# ── report ───────────────────────────────────────────────────────────────
if problems:
    print(f'FAIL: {len(problems)} wiring problem(s)\n')
    for p in problems:
        print(f'  {p}')
    sys.exit(1)

print(f'OK: {len(entries)} modules wired, {len(js_files)} JS files, '
      f'all imports resolve, panel writes go through PanelHost')
