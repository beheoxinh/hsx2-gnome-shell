#!/bin/bash
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MOD="$ROOT/modules/alienware-desktop-enable-gnome@hsx2coder"
W=$(mktemp -d "${TMPDIR:-/tmp}/alienware-e2e-prefs.XXXXXX")
export GSETTINGS_BACKEND=memory XDG_CONFIG_HOME="$W/config" XDG_CACHE_HOME="$W/cache"

echo "== full (real module)"
export XDG_DATA_HOME="$W/data"
EXT="$W/data/nautilus-python/extensions"; mkdir -p "$EXT"
echo '# my own duplicate' > "$EXT/duplicate.py"
echo '# legacy' > "$EXT/open_with_antigravity.py"
timeout 60 dbus-run-session -- gjs -m "$HERE/prefs-e2e.js" "$MOD" full 2>"$W/full.err"
grep -E "CRITICAL|Error|WARN" "$W/full.err" | grep -v -E "dbus-daemon|systemd1|fusermount" | head -10

echo "== missing nautilus-python (patched copy of the module)"
C="$W/copy"; mkdir -p "$C/modules"
cp -r "$MOD" "$C/modules/"; cp -r "$ROOT/lib" "$C/"
python3 - "$C/modules/alienware-desktop-enable-gnome@hsx2coder/nautilusSync.js" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
old = "findNautilusPython(roots = ['/usr/lib64', '/usr/lib', '/usr/local/lib64', '/usr/local/lib'])"
assert old in s
open(p, 'w').write(s.replace(old, "findNautilusPython(roots = ['/nonexistent/usr/lib'])"))
EOF
export XDG_DATA_HOME="$W/data2"
timeout 60 dbus-run-session -- gjs -m "$HERE/prefs-e2e.js" "$C/modules/alienware-desktop-enable-gnome@hsx2coder" missing 2>"$W/missing.err"
grep -E "CRITICAL|Error|WARN" "$W/missing.err" | grep -v -E "dbus-daemon|systemd1|fusermount" | head -10
