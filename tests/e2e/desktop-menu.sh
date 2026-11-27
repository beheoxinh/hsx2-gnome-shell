#!/bin/bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
APP="$ROOT/modules/alienware-desktop-enable-gnome@hsx2coder/app"
W=$(mktemp -d "${TMPDIR:-/tmp}/alienware-e2e-desktop.XXXXXX")
export E2E_OUT="$W/out" E2E_TREE="$W/tree" E2E_FAKEBIN="$W/bin"
mkdir -p "$E2E_OUT" "$E2E_TREE/dir" "$E2E_TREE/dir2" "$E2E_FAKEBIN"
cat > "$E2E_FAKEBIN/wl-copy" <<'EOF'
#!/bin/sh
cat > "$E2E_OUT/clip-$(date +%s%N)"
EOF
cat > "$E2E_FAKEBIN/fake-editor" <<'EOF'
#!/bin/sh
(IFS='|'; echo "$*|cwd=$PWD") >> "$E2E_OUT/openwith.log"
EOF
chmod +x "$E2E_FAKEBIN"/*
printf 'hello\nworld \xe2\x9c\x93\n' > "$E2E_TREE/a.txt"
echo b > "$E2E_TREE/b.txt"
echo inner > "$E2E_TREE/dir/inner.txt"
echo odd > "$E2E_TREE/we ird 'name\".txt"
truncate -s 60M "$E2E_TREE/big.bin"
echo arc > "$E2E_TREE/arc.tar.gz"
export GSETTINGS_BACKEND=memory XDG_SESSION_TYPE=wayland PATH="$E2E_FAKEBIN:$PATH"
export XDG_DATA_HOME="$W/data" XDG_CONFIG_HOME="$W/config" XDG_CACHE_HOME="$W/cache"
timeout 60 dbus-run-session -- gjs "$HERE/desktop-menu.js" "$APP" 2>"$W/stderr.log" || echo "exit=$?"
grep -v -E "^$" "$W/stderr.log" | head -20 || true
