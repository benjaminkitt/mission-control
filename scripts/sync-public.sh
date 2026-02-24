#!/usr/bin/env bash
# sync-public.sh — Sync main branch to public repo (clean snapshot)
#
# Usage: bash scripts/sync-public.sh
#
# Uses a WHITELIST approach: only specified files/dirs from main are included.
# Everything else stays private. Personal data files are replaced with empty schemas.

set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$WORKSPACE_ROOT"

# ─── Whitelist: only these paths get published ───────────────────────────────
INCLUDE_PATHS=(
  # App
  "mission-control"
  # Agent infrastructure
  ".claude"
  ".claude-plugin"
  ".github"
  "commands"
  "scripts"
  "skills"
  # Root files
  ".gitignore"
  "CLAUDE.md"
  "CONTRIBUTING.md"
  "LICENSE"
  "README.md"
)

# Files to remove AFTER overlay (private assets that live inside included dirs)
EXCLUDE_FILES=(
  "mission-control/docs/logo.png"
  "mission-control/docs/logo.svg"
)

# ─── Preflight checks ────────────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: Must be on main branch (currently on $CURRENT_BRANCH)"
  exit 1
fi

if ! git remote get-url public &>/dev/null; then
  echo "Error: 'public' remote not configured"
  exit 1
fi

# ─── Sync ─────────────────────────────────────────────────────────────────────
echo "=== Syncing main → public repo ==="

# Stash any uncommitted changes (tracked files only — untracked may have
# Windows file locks from VS Code / file watchers)
STASHED=false
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  git stash -q
  STASHED=true
  echo "Stashed uncommitted changes"
fi

# Switch to public-launch (force to handle Windows file locks on untracked dirs)
git checkout -f public-launch -q

# Overlay ONLY whitelisted paths from main
echo "Overlaying whitelisted paths from main..."
for p in "${INCLUDE_PATHS[@]}"; do
  if git ls-tree -d main -- "$p" &>/dev/null || git ls-tree main -- "$p" &>/dev/null; then
    git checkout main -- "$p"
    echo "  + $p"
  fi
done

# Remove excluded files (private assets inside included dirs)
for f in "${EXCLUDE_FILES[@]}"; do
  if git ls-files --error-unmatch "$f" &>/dev/null 2>&1; then
    git rm -f "$f" -q
    echo "  - $f"
  fi
done

# Replace personal data with empty schemas for clean first-run experience
echo "Cleaning data files for public repo..."
echo '{ "tasks": [] }' > mission-control/data/tasks.json
echo '{ "goals": [] }' > mission-control/data/goals.json
echo '{ "projects": [] }' > mission-control/data/projects.json
echo '{ "entries": [] }' > mission-control/data/brain-dump.json
echo '{ "messages": [] }' > mission-control/data/inbox.json
echo '{ "events": [] }' > mission-control/data/activity-log.json
echo '{ "decisions": [] }' > mission-control/data/decisions.json
echo '{ "missions": [] }' > mission-control/data/missions.json
git add mission-control/data/

# Amend and push
git commit --amend --no-edit -q
echo "Pushing to public remote..."
git push public public-launch:main --force

# Return to main (force to handle Windows file locks)
git checkout -f main -q
if [ "$STASHED" = true ]; then
  git stash pop -q
  echo "Restored stashed changes"
fi

echo "✅ Public repo synced successfully"
