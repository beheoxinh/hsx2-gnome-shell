#!/bin/bash
# Isolated Nautilus E2E: private D-Bus session, in-memory GSettings, temp XDG
# dirs, fake wl-copy (the real clipboard is untouched).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
MOD="$ROOT/modules/alienware-desktop-enable-gnome@hsx2coder"
W=$(mktemp -d "${TMPDIR:-/tmp}/alienware-e2e-nautilus.XXXXXX")
export E2E_OUT="$W/out" E2E_TREE="$W/tree" E2E_FAKEBIN="$W/bin"
mkdir -p "$E2E_OUT" "$E2E_TREE/dir" "$E2E_FAKEBIN" "$W/data" "$W/config" "$W/cache"

cat > "$E2E_FAKEBIN/wl-copy" <<'EOF'
#!/bin/sh
cat > "$E2E_OUT/clip-$(date +%s%N)"
EOF
cat > "$E2E_FAKEBIN/fake-editor" <<'EOF'
#!/bin/sh
(IFS='|'; echo "$*") >> "$E2E_OUT/openwith.log"
EOF
chmod +x "$E2E_FAKEBIN"/*

printf 'hello\nworld \xe2\x9c\x93\n' > "$E2E_TREE/a.txt"
echo b > "$E2E_TREE/b.txt"
echo inner > "$E2E_TREE/dir/inner.txt"
echo odd > "$E2E_TREE/we ird 'name\".txt"
truncate -s 60M "$E2E_TREE/big.bin"
echo arc > "$E2E_TREE/arc.tar.gz"
R="$E2E_TREE/repo"; mkdir -p "$R/sub"
git -C "$R" init -q
for f in clean mod; do echo $f > "$R/$f.txt"; done
echo s > "$R/sub/s.txt"
git -C "$R" add . && git -C "$R" -c user.name=t -c user.email=t@t commit -qm init
echo changed >> "$R/mod.txt"
echo st > "$R/staged.txt"; git -C "$R" add staged.txt
echo new > "$R/new.txt"
echo x > "$R/seen_while_off.txt"

# install the snapshot exactly like prefs does, into the temp data dir
XDG_DATA_HOME="$W/data" gjs -m "$HERE/install-e2e.js" "$MOD"
cp "$HERE/zz_e2e_driver.py" "$W/data/nautilus-python/extensions/"

export XDG_DATA_HOME="$W/data" XDG_CONFIG_HOME="$W/config" XDG_CACHE_HOME="$W/cache"
export GSETTINGS_BACKEND=memory PATH="$E2E_FAKEBIN:$PATH" NAUTILUS_PYTHON_DEBUG=misc
if [ "${E2E_WINDOW:-0}" = 1 ]; then NARGS=(--new-window "$E2E_TREE/repo"); else NARGS=(--gapplication-service); fi
timeout 90 dbus-run-session -- nautilus "${NARGS[@]}" > "$W/nautilus.log" 2>&1 || true
echo "workdir: $W"
if [ -f "$E2E_OUT/results.json" ]; then
  python3 - "$E2E_OUT/results.json" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
for x in r:
    print(('PASS ' if x['ok'] else 'FAIL ') + x['name'] + ('' if x['ok'] else f"  -> {x['detail']}"))
print(f"{sum(x['ok'] for x in r)}/{len(r)} passed")
EOF
else
  echo "NO RESULTS"; tail -40 "$W/nautilus.log"
fi
grep -E "Traceback|Error" "$W/nautilus.log" | head -20 || true
