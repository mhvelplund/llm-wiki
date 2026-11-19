#!/usr/bin/env bash
# Runs Claude Code against the wiki, streaming stdout/stderr to files instead
# of piping straight into jq: a hard stop (e.g. hitting --max-budget-usd)
# reports its reason as the final `result` line on stdout, not stderr, so we
# need the raw file to pull that reason back out afterwards.
#
# The claude invocation is the condition of an `if` (rather than a bare
# statement) so its exit code doesn't trip errexit before CLAUDE_EXIT is
# assigned. This matters even when this script is invoked directly (not
# just when its body was inlined into a workflow step): keep it this way.
#
# Required env: PROMPT. Optional env: MAX_BUDGET_USD (empty = uncapped).
# ANTHROPIC_API_KEY must be set for the `claude` CLI itself.
# Expects GITHUB_STEP_SUMMARY to be set (GitHub Actions sets this automatically).
set -uo pipefail

: "${PROMPT:?PROMPT env var is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY env var is required}"

CLAUDE_OUTPUT_FILE="${CLAUDE_OUTPUT_FILE:-/tmp/claude-output.jsonl}"
CLAUDE_ERRORS_FILE="${CLAUDE_ERRORS_FILE:-/tmp/errors.log}"

budget_args=()
[ -n "${MAX_BUDGET_USD:-}" ] && budget_args=(--max-budget-usd "$MAX_BUDGET_USD")

if claude -p "$PROMPT" \
  --dangerously-skip-permissions \
  --model sonnet \
  --effort high \
  "${budget_args[@]}" \
  --output-format stream-json \
  --verbose \
  >"$CLAUDE_OUTPUT_FILE" 2>"$CLAUDE_ERRORS_FILE"; then
  CLAUDE_EXIT=0
else
  CLAUDE_EXIT=$?
fi

{
  echo "## Claude thinking output"
  echo ""
  jq -r '.. | .thinking? // empty' "$CLAUDE_OUTPUT_FILE"
} >> "$GITHUB_STEP_SUMMARY"

RESULT_LINE=$(jq -c 'select(.type == "result")' "$CLAUDE_OUTPUT_FILE" 2>/dev/null | tail -n1 || true)
RESULT_IS_ERROR=$(echo "${RESULT_LINE:-null}" | jq -r '.is_error // false' 2>/dev/null || echo false)

if [ "$CLAUDE_EXIT" -ne 0 ] || [ "$RESULT_IS_ERROR" = "true" ]; then
  {
    echo "## Claude command failed"
    echo '```'
    echo "exit code: $CLAUDE_EXIT"
    if [ -n "$RESULT_LINE" ]; then
      echo "$RESULT_LINE" | jq '{subtype, errors, total_cost_usd, num_turns}'
    fi
    if [ -s "$CLAUDE_ERRORS_FILE" ]; then
      cat "$CLAUDE_ERRORS_FILE"
    fi
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
  exit 1
fi
