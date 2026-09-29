#!/usr/bin/env bash
# Parse-only syntax check for every JS file in the suite.
# `node --check` parses ESM without resolving gi:// or resource:// specifiers.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

if ! command -v node >/dev/null 2>&1; then
    echo "SKIP: node not found, cannot run syntax check"
    exit 0
fi

fail=0
count=0
while IFS= read -r f; do
    count=$((count + 1))
    if ! out="$(node --check "$f" 2>&1)"; then
        echo "SYNTAX FAIL $f"
        echo "$out" | head -6
        fail=1
    fi
done < <(find . -name '*.js' -not -path './.git/*' -not -path './.bak/*' | sort)

if [ "$fail" -ne 0 ]; then
    exit 1
fi
echo "OK: $count JS files parse cleanly"
