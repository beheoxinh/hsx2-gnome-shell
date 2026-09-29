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

python3 - "${FILES[@]}" <<'PY'
import re
import sys
import xml.etree.ElementTree as ET

# key name -> {schema id -> file}
index = {}
dup_schema_id = {}
for path in sys.argv[1:]:
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

collisions = {k: v for k, v in index.items() if len(v) > 1}

if collisions:
    print(f"FAIL: {len(collisions)} key name(s) declared in more than one schema id\n")
    for name in sorted(collisions):
        print(f"  {name}")
        for sid, path in sorted(collisions[name].items()):
            print(f"      {sid}  <-  {path}")
        print()
    sys.exit(1)

print(f"OK: {len(index)} distinct key names across {len(dup_schema_id)} schema ids, 0 collisions")
PY
