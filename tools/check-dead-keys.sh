#!/usr/bin/env bash
# Two independent static checks:
#   1. dead keys    - key declared in a schema but never read/written by any JS
#   2. orphan code  - a schema id referenced from JS that no xml declares
# Also validates every schema dir with --strict and reports stale gschemas.compiled.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

# migrations/schemas holds frozen copies of schemas the keys moved out of; they
# are sources for migrations.js only and are not registered with the shell
mapfile -t XML < <(find schemas modules -name '*.gschema.xml' 2>/dev/null | sort)
mapfile -t JS < <(find . -name '*.js' -not -path './.git/*' -not -path './.bak/*' 2>/dev/null | sort)

if [ ${#XML[@]} -eq 0 ] || [ ${#JS[@]} -eq 0 ]; then
    echo "ERROR: need both *.gschema.xml and *.js under $ROOT" >&2
    exit 2
fi

RC=0
ALLOW="tools/dead-keys-allow.txt"
[ -f "$ALLOW" ] || { echo "ERROR: $ALLOW missing" >&2; exit 2; }

python3 - "${ROOT}" "${ALLOW}" "${#XML[@]}" "${XML[@]}" "${#JS[@]}" "${JS[@]}" <<'PY'
import os
import re
import sys

root = sys.argv[1]
allow = {l.strip() for l in open(sys.argv[2]) if l.strip() and not l.startswith('#')}
n_xml = int(sys.argv[3])
xml_files = sys.argv[4:4 + n_xml]
n_js = int(sys.argv[4 + n_xml])
js_files = sys.argv[5 + n_xml:5 + n_xml + n_js]

import xml.etree.ElementTree as ET

keys = {}          # key name -> (schema id, file)
schema_ids = {}    # schema id -> file
for path in xml_files:
    root_el = ET.parse(path).getroot()
    for schema in root_el.iter('schema'):
        sid = schema.get('id')
        schema_ids[sid] = path
        for key in schema.findall('key'):
            keys[key.get('name')] = (sid, path)

js_blob = []
for path in js_files:
    try:
        js_blob.append(open(path, encoding='utf-8', errors='replace').read())
    except OSError:
        pass
blob = '\n'.join(js_blob)

rc = 0
port_only = 0
dead = []
for name, (sid, path) in sorted(keys.items()):
    if sid in allow:
        # only report when the whole schema is upstream AND every key is unused
        port_only += 1
        continue
    # a key counts as used if its name appears in any JS file as a quoted literal
    if not re.search(r"['\"]" + re.escape(name) + r"['\"]", blob):
        dead.append((name, sid, path))

if dead:
    print(f"DEAD KEYS: {len(dead)} declared but never referenced from JS\n")
    for name, sid, path in dead:
        print(f"  {name:40s} {sid}\n      {path}")
    print()
    rc = 1
else:
    print("OK: every declared key is referenced from JS "
          f"({port_only} key(s) skipped as upstream-port)")

# schema ids referenced from JS but never declared
refs = set(re.findall(r"['\"](org\.[A-Za-z0-9._-]+)['\"]", blob))
MIGRATION_ONLY = {'org.gnome.shell.extensions.panel-clone',
                  'org.gnome.shell.extensions.topbar-panel-controls'}
orphan_refs = sorted(r for r in refs if r.startswith(('org.gnome.shell.extensions.',))
                     and r not in schema_ids and r not in MIGRATION_ONLY
                     and not r.endswith(('.desktop',)))
if orphan_refs:
    print(f"ORPHAN SCHEMA REFS: {len(orphan_refs)} id(s) used in JS but not declared\n")
    for r in orphan_refs:
        print(f"  {r}")
    print()
    rc = 1
else:
    print("OK: no orphan schema id references")

sys.exit(1 if rc else 0)
PY
if [ $? -ne 0 ]; then RC=1; fi

echo
echo "=== glib-compile-schemas --strict ==="
while IFS= read -r d; do
    out="$(glib-compile-schemas --strict --dry-run "$d" 2>&1)"
    if [ -n "$out" ]; then
        echo "FAIL $d"
        echo "$out" | head -5
        RC=1
    elif [ ! -f "$d/gschemas.compiled" ]; then
        echo "STALE $d (gschemas.compiled missing)"
        RC=1
    else
        newer="$(find "$d" -name '*.gschema.xml' -newer "$d/gschemas.compiled" -print -quit)"
        if [ -n "$newer" ]; then
            echo "STALE $d (xml newer than gschemas.compiled: $newer)"
            RC=1
        else
            echo "OK   $d"
        fi
    fi
done < <(find schemas modules -type d -name schemas 2>/dev/null | sort)

exit $RC
