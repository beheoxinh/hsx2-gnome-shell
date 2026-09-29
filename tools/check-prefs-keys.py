#!/usr/bin/env python3
"""Verify that each preferences file only touches keys of its own schema.

`check-key-usage.py` proves a key exists in *some* schema. That is not enough:
`settings.bind('panel-visible', ...)` in the notification configurator would pass
it and still throw when the window opens, because that module's Gio.Settings has
no such key. This check resolves the schema each file actually uses and compares.

Schema resolution:
  * module file            -> modules/<uuid>/schemas/*.xml, matching
                              metadata.json settings-schema when declared
  * root prefs.js/extension.js -> schemas/
  * a file that calls getSettings('<id>') is judged against that id
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

problems = []


def schema_keys(path):
    root = ET.parse(path).getroot()
    return {k.get('name') for k in root.iter('key')}


def schema_id_of(path):
    root = ET.parse(path).getroot()
    for schema in root.iter('schema'):
        return schema.get('id')
    return None


# every schema id shipped, and which dir it lives in
by_dir = {}
all_keys = {}
for path in glob.glob('schemas/*.xml') + glob.glob('modules/*/schemas/*.xml'):
    d = os.path.dirname(path)
    by_dir.setdefault(d, {})[schema_id_of(path)] = schema_keys(path)
    all_keys.setdefault(schema_id_of(path), set()).update(schema_keys(path))

# module metadata -> settings-schema
module_schema = {}
for meta_path in glob.glob('modules/*/metadata.json'):
    meta = json.load(open(meta_path, encoding='utf-8'))
    module_schema[os.path.dirname(meta_path)] = meta.get('settings-schema')

PATTERNS = [
    re.compile(r"\bget_(?:boolean|int|uint|double|strv|string|value)\(\s*'([^']+)'"),
    re.compile(r"\bset_(?:boolean|int|uint|double|strv|string|value)\(\s*'([^']+)'"),
    re.compile(r"\bbind\(\s*'([^']+)'"),
    re.compile(r"changed::([A-Za-z0-9_-]+)"),
    re.compile(r"has_key\(\s*'([^']+)'"),
]

IGNORE_PREFIX = ('org.gnome.mutter.', 'org.gnome.desktop.', 'org.gnome.shell.screencast')
ALLOW = set()
if os.path.isfile('tools/key-usage-allow.txt'):
    ALLOW = {l.strip() for l in open('tools/key-usage-allow.txt')
             if l.strip() and not l.startswith('#')}


def allowed(name):
    return name in ALLOW or any(name.startswith(p) for p in ALLOW if p.endswith('-'))


for path in sorted(glob.glob('modules/*/prefs.js') + glob.glob('modules/*/*/prefs.js')
                   + ['prefs.js', 'extension.js', 'migrations.js']):
    if not os.path.isfile(path):
        continue
    text = open(path, encoding='utf-8', errors='replace').read()

    # which schema does this file talk to?
    uuid_dir = None
    parts = path.split(os.sep)
    if parts[0] == 'modules':
        uuid_dir = os.path.join(parts[0], parts[1])

    explicit = re.findall(r"getSettings\(\s*'([^']+)'\)", text)
    candidates = set(explicit)
    if uuid_dir and module_schema.get(uuid_dir):
        candidates.add(module_schema[uuid_dir])

    own_keys = set()
    for dirpath, schemas in by_dir.items():
        if (uuid_dir and dirpath.startswith(uuid_dir)) or (not uuid_dir and dirpath == 'schemas'):
            for keys in schemas.values():
                own_keys |= keys
    for ident in candidates:
        own_keys |= all_keys.get(ident, set())

    if not own_keys:
        problems.append(f'{path}: could not resolve a schema')
        continue

    # a file that legitimately spans schemas (the top bar hosts two widget
    # schemas) declares them explicitly; always union those in
    for dirpath, schemas in by_dir.items():
        if uuid_dir and dirpath.startswith(uuid_dir):
            for keys in schemas.values():
                own_keys |= keys

    used = set()
    for pat in PATTERNS:
        used |= set(pat.findall(text))

    for key in sorted(used):
        if key in own_keys or allowed(key) or key.startswith(IGNORE_PREFIX):
            continue
        # the root suite files legitimately read module keys only via modules.js
        if uuid_dir is None and path in ('extension.js', 'prefs.js'):
            if key.startswith(('enable-', 'migration-')):
                continue
        line = next((n for n, l in enumerate(text.splitlines(), 1)
                     if f"'{key}'" in l), 0)
        problems.append(f'{path}:{line}: uses {key!r} which its schema(s) '
                        f'{[module_schema.get(uuid_dir)] + explicit} do not declare')

if problems:
    print(f'FAIL: {len(problems)} key(s) used against the wrong schema\n')
    for p in problems:
        print(f'  {p}')
    sys.exit(1)

print('OK: every preferences/extension file only touches keys of its own schema')
