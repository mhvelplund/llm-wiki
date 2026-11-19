#!/usr/bin/env bash
# Commits and pushes whatever the wiki run changed. Run from the repo root
# after `claude` has finished editing wiki/ and sha.log.
#
# Expects GH_TOKEN (for `git push` auth, via the calling workflow's git
# credential setup) and GITHUB_STEP_SUMMARY to be set.
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

git add -A
if git diff --cached --quiet; then
  echo "No changes to commit" >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

CREATED=$(git diff --cached --name-status | grep -c '^A' || true)
UPDATED=$(git diff --cached --name-status | grep -c '^M' || true)

git commit -m "chore(docs): Files $CREATED/$UPDATED [skip ci]"
git push origin main
