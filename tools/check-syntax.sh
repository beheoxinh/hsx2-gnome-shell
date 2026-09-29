#!/usr/bin/env bash
# Parse every JS file as an ES module.
#
# `node --check foo.js` parses as a CommonJS script and accepts constructs a real
# ES module rejects. That is how a stray closing brace in topbar-clone/main.js
# passed every check while the module could not be loaded at all. Copying each
# file to .mjs makes node --check use the module grammar, and unlike
# vm.SourceTextModule it still reports line numbers.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 2

if ! node --version >/dev/null 2>&1; then
    echo "SKIP: node not found, cannot run syntax check"
    exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
count=0
while IFS= read -r f; do
    count=$((count + 1))
    cp "$f" "$TMP/check.mjs"
    if ! out="$(node --check "$TMP/check.mjs" 2>&1)"; then
        echo "SYNTAX FAIL $f"
        echo "$out" | sed "s#$TMP/check.mjs#$f#" | head -6
        fail=1
    fi
done < <(find . -name '*.js' -not -path './.git/*' -not -path './.bak/*' \
             -not -path './node_modules/*' | sort)

if [ "$fail" -ne 0 ]; then
    exit 1
fi
echo "OK: $count JS files parse as ES modules"
