#!/usr/bin/env bash
# Installs the Claude Code CLI into ~/.npm-global if it isn't already on PATH
# (e.g. restored from the actions/cache@v6 cache in the calling workflow).
#
# Expects GITHUB_PATH to be set (GitHub Actions sets this automatically).
set -euo pipefail

npm config set prefix "$HOME/.npm-global"
echo "$HOME/.npm-global/bin" >> "$GITHUB_PATH"
export PATH="$HOME/.npm-global/bin:$PATH"
if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
else
  echo "claude already installed from cache: $(command -v claude)"
fi
