#!/usr/bin/env bash
# Fail if any GSettings key name is declared in more than one schema id.
# Different schema ids hide the collision from GSettings/dconf, which is how
# alienware-gnome-customizer-manager and alienware-topbar-panel-controls ended
# up with two different features under the same key name.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

mapfile -t FILES < <(find schemas modules -name '*.gschema.xml' 2>/dev/null | sort)

if [ ${#FILES[@]} -eq 0 ]; then
    echo "ERROR: no *.gschema.xml found under $ROOT" >&2
    exit 2
fi

python3 - tools/schema-collision-allow.txt "${FILES[@]}" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

ALLOW_FILE = sys.argv[1]
allowed_pairs = set()
for line in open(ALLOW_FILE):
    line = line.strip()
    if line and not line.startswith('#') and ',' in line:
        a, b = (p.strip() for p in line.split(',', 1))
        allowed_pairs.add(frozenset((a, b)))

# key name -> {schema id -> file}
index = {}
dup_schema_id = {}
for path in sys.argv[2:]:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as e:
        print(f"XML PARSE ERROR {path}: {e}", file=sys.stderr)
        sys.exit(2)
    for schema in root.iter('schema'):
        sid = schema.get('id')
        if sid in dup_schema_id:
            print(f"DUPLICATE SCHEMA ID {sid}\n  {dup_schema_id[sid]}\n  {path}")
        dup_schema_id[sid] = path
        for key in schema.findall('key'):
            index.setdefault(key.get('name'), {}).setdefault(sid, path)

collisions = {}
allowed = 0
for name, owners in index.items():
    if len(owners) < 2:
        continue
    ids = sorted(owners)
    unallowed = any(
        frozenset((ids[a], ids[b])) not in allowed_pairs
        for a in range(len(ids)) for b in range(a + 1, len(ids)))
    if unallowed:
        collisions[name] = owners
    else:
        allowed += 1

if collisions:
    print(f"FAIL: {len(collisions)} key name(s) declared in more than one schema id\n")
    for name in sorted(collisions):
        print(f"  {name}")
        for sid, path in sorted(collisions[name].items()):
            print(f"      {sid}  <-  {path}")
        print()
    sys.exit(1)

print(f"OK: {len(index)} distinct key names across {len(dup_schema_id)} schema ids, "
      f"0 unallowed collisions ({allowed} allowed upstream-port pair(s))")
PY
