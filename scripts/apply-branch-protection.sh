#!/usr/bin/env bash
# Apply (or update) the `main` ruleset in .github/rulesets/main.json.
#
# WHY THIS IS A SCRIPT AND NOT A WORKFLOW: `main` currently has NO branch
# protection and NO rulesets, so every gate the project advertises — lint, the
# four-platform matrix, Router E2E, Combine, the dependency audit, CodeQL — is a
# convention rather than a mechanism, and a red merge or a direct push is
# possible today (round-6 review R6-02). Enabling protection is an OWNER action
# against the live repository, so it is prepared here and applied deliberately,
# never automatically by an agent.
#
#   ./scripts/apply-branch-protection.sh            # apply to the current repo
#   ./scripts/apply-branch-protection.sh --dry-run  # print what would be sent
#
# Requires: gh, authenticated with admin rights on the repository.
#
# Note on the external scanners: Semgrep and Sourcery run as GitHub Apps on
# pull requests only. They are deliberately NOT in the required list — Sourcery
# reports "skipped" on some runs, and a required check that skips blocks the
# merge queue forever. Add { "context": "semgrep-cloud-platform/scan" } to the
# ruleset if you want Semgrep to be blocking.
set -euo pipefail

RULESET_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.github/rulesets/main.json"
[ -f "$RULESET_FILE" ] || { echo "missing $RULESET_FILE" >&2; exit 1; }

if [ "${1:-}" = "--dry-run" ]; then
  echo "would apply to $(gh repo view --json nameWithOwner -q .nameWithOwner):"
  cat "$RULESET_FILE"
  exit 0
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
NAME="$(jq -r .name "$RULESET_FILE")"

# Update in place when a ruleset of this name already exists, so re-running is
# idempotent instead of accumulating duplicates.
EXISTING_ID="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$NAME\") | .id" | head -1)"

if [ -n "$EXISTING_ID" ]; then
  echo "updating existing ruleset $NAME (id $EXISTING_ID) on $REPO"
  gh api --method PUT "repos/$REPO/rulesets/$EXISTING_ID" --input "$RULESET_FILE" >/dev/null
else
  echo "creating ruleset $NAME on $REPO"
  gh api --method POST "repos/$REPO/rulesets" --input "$RULESET_FILE" >/dev/null
fi

echo "active rulesets on $REPO:"
gh api "repos/$REPO/rulesets" --jq '.[] | "  \(.name) — \(.enforcement) — target \(.target)"'
