#!/bin/bash
# End-to-end checks for Nautilus Context (see README.md). Nothing touches the
# real session: private D-Bus, in-memory GSettings, temp XDG dirs, fake
# wl-copy. Pass --window to also run the Nautilus suite with a real window
# (a temporary Nautilus window opens for ~20 s).
HERE=$(cd "$(dirname "$0")" && pwd)
status=0
check() {
    local name=$1; shift
    echo "=== $name"
    local out
    out=$("$@" 2>&1)
    echo "$out" | grep -E '^(PASS|FAIL)|passed|NO RESULTS|^== '
    if echo "$out" | grep -qE '^FAIL|NO RESULTS'; then
        status=1
    elif ! echo "$out" | grep -qE '^[0-9]+/[0-9]+ passed'; then
        echo "!! $name produced no result line"; echo "$out" | tail -20; status=1
    else
        echo "$out" | grep -E '^[0-9]+/[0-9]+ passed' | awk -F'[/ ]' '$1 != $2 {exit 1}' || status=1
    fi
}
check "Nautilus plugins (headless)" bash "$HERE/nautilus.sh"
[ "${1:-}" = --window ] && check "Nautilus plugins (real window)" env E2E_WINDOW=1 bash "$HERE/nautilus.sh"
check "Desktop context menu" bash "$HERE/desktop-menu.sh"
check "Prefs: Nautilus Context tab" bash "$HERE/prefs.sh"
echo; [ $status = 0 ] && echo "ALL E2E PASSED" || echo "E2E FAILURES"
exit $status
