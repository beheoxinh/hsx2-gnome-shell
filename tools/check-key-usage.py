#!/usr/bin/env python3
"""Find GSettings keys that code reads or writes but no schema declares.

This is the failure mode that GSettings hides: get_int() on an unknown key
throws, but get_boolean() on one whose key was renamed silently returns the
default, and nothing warns. Run after every key move.

    python3 tools/check-key-usage.py [--json]
"""
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

# schema ids and which GSettings object a file talks to; a key is only
# suspicious when the file has no other schema that declares it
XML = sorted(glob.glob('schemas/*.xml') + glob.glob('modules/*/schemas/*.xml')
             + glob.glob('modules/*/*/schemas/*.xml'))
JS = sorted(f for f in glob.glob('**/*.js', recursive=True)
            if not f.startswith(('.git/', '.bak/')))

declared = {}          # key name -> {schema id: file}
for path in XML:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        print(f'XML PARSE ERROR {path}: {e}', file=sys.stderr)
        sys.exit(2)
    for schema in root.iter('schema'):
        for key in schema.findall('key'):
            declared.setdefault(key.get('name'), {})[schema.get('id')] = path

# get_x('key') / set_x('key') / bind('key', ...) / connect('changed::key', ...)
PATTERNS = [
    re.compile(r"\bget_(?:boolean|int|uint|double|strv|string|value)\(\s*'([^']+)'"),
    re.compile(r"\bset_(?:boolean|int|uint|double|strv|string|value)\(\s*'([^']+)'"),
    re.compile(r"\bbind\(\s*'([^']+)'"),
    re.compile(r"changed::([A-Za-z0-9_-]+)"),
    re.compile(r"list_keys\(\)\[0\]"),
]

ALLOW = 'tools/key-usage-allow.txt'

# keys that are legitimately not GSettings: mate/mutter schemas and gsettings paths
IGNORE_PREFIX = ('org.gnome.mutter.', 'org.gnome.desktop.', 'org.gnome.shell.')
allowed = {l.strip() for l in open(ALLOW) if l.strip() and not l.startswith('#')}


def is_allowed(name):
    return name in allowed or any(name.startswith(p) for p in allowed if p.endswith('-'))


def looks_like_gsettings_key(name):
    return bool(re.fullmatch(r'[a-z0-9][a-z0-9-]*', name)) and '-' in name


suspects = {}
for path in JS:
    try:
        text = open(path, encoding='utf-8', errors='replace').read()
    except OSError:
        continue
    found = set()
    for pat in PATTERNS[:4]:
        found |= set(pat.findall(text))
    for key in found:
        if not looks_like_gsettings_key(key) or key.startswith(IGNORE_PREFIX):
            continue
        if key in declared or is_allowed(key):
            continue
        suspects.setdefault(key, []).append(path)

# cross-check: a key may live in a schema that a *different* file's settings
# object reads, so only report keys that are unknown to EVERY schema
if '--json' in sys.argv:
    print(json.dumps({k: v for k, v in sorted(suspects.items())}, indent=2))
    sys.exit(0)

if suspects:
    print(f'FAIL: {len(suspects)} key name(s) used in code but declared by no schema\n')
    for key in sorted(suspects):
        print(f'  {key}')
        for path in suspects[key]:
            print(f'      {path}')
        print()
    sys.exit(1)

print(f'OK: every literal key used in code exists in some schema '
      f'({len(declared)} key names known)')
