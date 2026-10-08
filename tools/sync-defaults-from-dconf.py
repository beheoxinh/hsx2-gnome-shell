#!/usr/bin/env python3
"""Sync live dconf values into gschema.xml <default> for owned schemas.

Format-preserving: operates line-wise, only replaces the text content of
<default>...</default> lines belonging to keys with a differing live value.
No XML re-serialization, so diffs stay minimal (one line per changed key).

Usage: python3 tools/sync-defaults-from-dconf.py [--apply]
  dry-run prints per-file changed keys; --apply rewrites files in place.

Rules:
  - Only keys whose live dconf value differs from current <default> change.
  - panel-element-positions (per-monitor layout JSON) is SKIPPED: a fresh
    machine generates its own layout for its own monitors.
  - migration-* guard keys are SKIPPED: fresh installs must re-run migrations.
  - Keys with no live value keep their existing <default>.
"""
import glob
import re
import subprocess
import sys

APPLY = '--apply' in sys.argv

# Per-monitor / per-hardware JSON: a fresh machine generates its own layout
# for its own monitors. Never snapshot laptop-specific connector ids.
SKIP_KEYS = {
    ('org.gnome.shell.extensions.dash-to-panel', 'panel-element-positions'),
    ('org.gnome.shell.extensions.dash-to-panel', 'panel-lengths'),
    ('org.gnome.shell.extensions.dash-to-panel', 'panel-anchors'),
    ('org.gnome.shell.extensions.dash-to-panel', 'primary-monitor'),
    ('org.gnome.shell.extensions.dash-to-panel', 'panel-visible'),
}
SKIP_PREFIX = ('migration-',)

files = sorted(glob.glob('schemas/*.xml')
               + glob.glob('modules/*/schemas/*.xml')
               + glob.glob('modules/*/*/schemas/*.xml'))

total_changed = 0
for f in files:
    # schema id + path per file (one schema per file in this repo)
    with open(f, encoding='utf-8') as fh:
        text = fh.read()
    m_id = re.search(r'''<schema[^>]*id=['"]([^'"]+)['"]''', text)
    m_path = re.search(r'''<schema[^>]*path=['"]([^'"]+)['"]''', text)
    if not m_id or not m_path:
        print(f"{f}: NO SCHEMA HEADER, skipped")
        continue
    sid, path = m_id.group(1), m_path.group(1)
    try:
        out = subprocess.run(['dconf', 'dump', path],
                             capture_output=True, text=True,
                             timeout=15).stdout
    except Exception as e:
        print(f"{f}: DUMP_ERR {e}")
        continue
    live = {}
    in_top = False
    for line in out.splitlines():
        s = line.strip()
        if s.startswith('['):
            in_top = (s == '[/]')
            continue
        if in_top and line and '=' in line:
            k, _, v = line.partition('=')
            live[k.strip()] = v.strip()
    # walk lines, track current <key name="..."> — the opening tag may span
    # multiple lines (type/enum on one line, name on the next), so accumulate
    # until the tag closes with '>'.
    lines = text.splitlines(keepends=True)
    cur_key = None
    in_key_tag = False
    key_buf = ''
    changed = []
    for i, line in enumerate(lines):
        if '<key ' in line or '<key\n' in line:
            in_key_tag = True
            key_buf = line
            if '>' in line:
                in_key_tag = False
                km = re.search(r'''name=['"]([^'"]+)['"]''', key_buf)
                cur_key = km.group(1) if km else None
            continue
        if in_key_tag:
            key_buf += line
            if '>' in line:
                in_key_tag = False
                km = re.search(r'''name=['"]([^'"]+)['"]''', key_buf)
                cur_key = km.group(1) if km else None
            continue
        if '</key>' in line:
            cur_key = None
        dm = re.search(r'(<default>)(.*)(</default>)', line)
        if dm and cur_key:
            if cur_key.startswith(SKIP_PREFIX) or (sid, cur_key) in SKIP_KEYS:
                continue
            if cur_key not in live:
                continue
            cur_val, new_val = dm.group(2).strip(), live[cur_key]
            if cur_val == new_val:
                continue
            changed.append((cur_key, cur_val, new_val))
            if APPLY:
                lines[i] = line.replace(dm.group(1) + dm.group(2) + dm.group(3),
                                        dm.group(1) + new_val + dm.group(3), 1)
    if changed:
        print(f"{f}: {len(changed)} keys")
        for name, cur_val, new_val in changed:
            c = (cur_val[:90] + '...') if len(cur_val) > 90 else cur_val
            n = (new_val[:90] + '...') if len(new_val) > 90 else new_val
            print(f"    {name}: {c!r} -> {n!r}")
        total_changed += len(changed)
        if APPLY:
            with open(f, 'w', encoding='utf-8') as fh:
                fh.writelines(lines)
print(f"TOTAL_CHANGED={total_changed} APPLY={APPLY}")
