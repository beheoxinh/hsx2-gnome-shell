#!/usr/bin/env bash
# Run every static check for the suite. No shell restart required.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

FAIL=0
run() {
    echo "── $1"
    shift
    if "$@"; then :; else FAIL=1; echo; fi
}

run "syntax"            ./tools/check-syntax.sh
run "schema collisions" ./tools/check-schema-collisions.sh
run "dead keys"         ./tools/check-dead-keys.sh
run "key usage"         python3 tools/check-key-usage.py
run "prefs keys"        python3 tools/check-prefs-keys.py
run "wiring"            python3 tools/check-wiring.py
run "schemas load"      env GSETTINGS_BACKEND=memory gjs -m tools/check-schemas.js
run "migration map"    env GSETTINGS_BACKEND=memory gjs -m tools/migration-dry-run.js

echo
if [ "$FAIL" -ne 0 ]; then
    echo "SUITE CHECK FAILED"
    exit 1
fi
echo "ALL CHECKS PASSED"
