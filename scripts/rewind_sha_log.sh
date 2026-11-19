#!/usr/bin/env bash
# Rewinds sha.log so each submodule points at its tip from one week ago,
# ahead of a "weekly full pickup" wiki run (see wiki-run.yml's rewind-week
# input). Run from the repo root; expects sha.log and sources/<module> to
# exist as normal git checkouts.
#
# Expects GITHUB_STEP_SUMMARY to be set (GitHub Actions sets this automatically).
set -euo pipefail

tmp=$(mktemp)
while IFS= read -r line || [ -n "$line" ]; do
  module=${line%%:*}
  module=$(echo "$module" | xargs)   # trim whitespace
  [ -z "$module" ] && continue
  sha=$(git -C "sources/$module" rev-list -1 --before="1 week ago" HEAD || true)
  if [ -z "$sha" ]; then
    # Repo younger than a week — fall back to its first commit
    sha=$(git -C "sources/$module" rev-list --max-parents=0 HEAD | tail -n1)
  fi
  echo "$module: $sha" >> "$tmp"
done < sha.log
mv "$tmp" sha.log

echo "## Rewound sha.log (weekly full pickup)" >> "$GITHUB_STEP_SUMMARY"
echo '```' >> "$GITHUB_STEP_SUMMARY"
cat sha.log >> "$GITHUB_STEP_SUMMARY"
echo '```' >> "$GITHUB_STEP_SUMMARY"
