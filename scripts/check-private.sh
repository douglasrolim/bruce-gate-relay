#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Scans tracked files for secrets and private deployment details before you push.
# Put your own private strings (domain, Wi-Fi name, emails...) one per line in
# .private-terms (gitignored). Usage: scripts/check-private.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
files=$(git ls-files)

# Generic secret patterns.
patterns=(
  'BEGIN [A-Z ]*PRIVATE KEY'
  'CF-Access-Client-Secret: *[A-Za-z0-9]{20,}'
  '"(token|accessClientSecret|password)" *: *"[A-Za-z0-9_\-]{16,}"'
  'DEVICE_TOKEN *= *[A-Za-z0-9_\-]{32,}'
  'account_id *= *"[0-9a-f]{32}"'
  'ghp_[A-Za-z0-9]{30,}'
)
for p in "${patterns[@]}"; do
  if echo "$files" | xargs -d '\n' grep -nIE "$p" -- 2>/dev/null | grep -v '\.example' | grep -v 'scripts/check-private.sh'; then
    echo "✗ possible secret matching: $p"; fail=1
  fi
done

# Personal strings from .private-terms (never committed).
if [[ -f .private-terms ]]; then
  while IFS= read -r term; do
    [[ -z "$term" || "$term" == \#* ]] && continue
    if echo "$files" | xargs -d '\n' grep -nIiF -- "$term" 2>/dev/null; then
      echo "✗ private term found: $term"; fail=1
    fi
    if git log --all --format='%an %ae %s %b' | grep -qiF -- "$term"; then
      echo "✗ private term found in commit history: $term"; fail=1
    fi
  done < .private-terms
else
  echo "! no .private-terms file: only generic patterns were checked"
fi

# Files that must never be tracked.
for f in worker/wrangler.toml worker/.dev.vars gate-relay.json; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then echo "✗ $f must not be committed"; fail=1; fi
done
if echo "$files" | grep -E '\.sub$'; then echo "✗ .sub captures must not be committed"; fail=1; fi

if [[ $fail -eq 0 ]]; then echo "✓ no secrets or private terms found"; fi
exit $fail
