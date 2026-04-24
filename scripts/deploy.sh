#!/usr/bin/env bash
# DZ-GPT — one-shot deploy helper.
# Reads tokens from env vars (never hard-coded), commits all current
# working-tree changes to the active branch, pushes to GitHub origin,
# then triggers a Vercel deployment.
#
# Usage:
#   GH_TOKEN=ghp_xxx VERCEL_TOKEN=vcp_xxx ./scripts/deploy.sh \
#     "feat(dz-tube): production extractor + audio engine"
#
# Optional env:
#   GH_USER       — GitHub username (default: parsed from `origin` URL)
#   GH_REPO       — GitHub repo  (default: parsed from `origin` URL)
#   GIT_BRANCH    — branch to push (default: current branch)
#   VERCEL_PROJECT — Vercel project name (default: GH_REPO lowercased, no dashes-stripped)
#   VERCEL_TEAM   — Vercel team slug (omit for personal account)
#   COMMIT_AUTHOR — name <email> (default: "dz-gpt-bot <bot@dz-gpt.local>")

set -euo pipefail

# ------------------------------- INPUT CHECKS --------------------------------
COMMIT_MSG="${1:-chore: deploy from Replit}"
: "${GH_TOKEN:?Set GH_TOKEN (GitHub PAT with repo scope)}"
: "${VERCEL_TOKEN:?Set VERCEL_TOKEN (Vercel personal/team token)}"

# ----------------------------- DERIVE GH ORIGIN ------------------------------
ORIGIN_URL="$(git config --get remote.origin.url)"
# Accept https://github.com/USER/REPO(.git) or git@github.com:USER/REPO(.git)
RE='([^/:]+)/([^/]+?)(\.git)?$'
[[ "$ORIGIN_URL" =~ $RE ]] || { echo "Cannot parse origin URL: $ORIGIN_URL" >&2; exit 1; }
GH_USER="${GH_USER:-${BASH_REMATCH[1]}}"
GH_REPO="${GH_REPO:-${BASH_REMATCH[2]}}"
GIT_BRANCH="${GIT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

echo "==> Target: github.com/${GH_USER}/${GH_REPO}  branch=${GIT_BRANCH}"

# ------------------------- CLEAR ANY STALE LOCK ------------------------------
[[ -f .git/index.lock ]] && rm -f .git/index.lock

# ------------------------------ COMMIT + PUSH --------------------------------
COMMIT_AUTHOR="${COMMIT_AUTHOR:-dz-gpt-bot <bot@dz-gpt.local>}"
git -c "user.name=${COMMIT_AUTHOR%% <*}" \
    -c "user.email=${COMMIT_AUTHOR#*<}" \
    -c "user.email=${COMMIT_AUTHOR##*<}" \
    add -A

if git diff --cached --quiet; then
  echo "==> Working tree clean, nothing to commit."
else
  EMAIL="$(echo "$COMMIT_AUTHOR" | sed -E 's/.*<(.*)>/\1/')"
  NAME="$(echo "$COMMIT_AUTHOR" | sed -E 's/^(.*) <.*$/\1/')"
  git -c "user.name=${NAME}" -c "user.email=${EMAIL}" commit -m "${COMMIT_MSG}"
fi

# Push using a temporary credential URL (does NOT touch user's git config).
PUSH_URL="https://x-access-token:${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git"
echo "==> Pushing to GitHub..."
git push "${PUSH_URL}" "${GIT_BRANCH}":"${GIT_BRANCH}"
echo "==> Push OK."

# ------------------------------ VERCEL DEPLOY --------------------------------
# Most Vercel projects auto-deploy on push (GitHub integration). The block
# below ALSO triggers an explicit redeploy via the Vercel REST API for the
# current branch, so the deploy starts immediately even if the GitHub hook
# is delayed.
PROJ_RAW="${VERCEL_PROJECT:-${GH_REPO}}"
PROJ_NAME="$(echo "$PROJ_RAW" | tr '[:upper:]' '[:lower:]')"
TEAM_QS=""
[[ -n "${VERCEL_TEAM:-}" ]] && TEAM_QS="?slug=${VERCEL_TEAM}"

# Resolve the latest commit SHA we just pushed.
SHA="$(git rev-parse "${GIT_BRANCH}")"

echo "==> Triggering Vercel deploy for project '${PROJ_NAME}' @ ${SHA:0:8}..."
HTTP_CODE=$(curl -sS -o /tmp/vercel-deploy.json -w "%{http_code}" \
  -X POST "https://api.vercel.com/v13/deployments${TEAM_QS}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @- <<JSON
{
  "name": "${PROJ_NAME}",
  "target": "production",
  "gitSource": {
    "type": "github",
    "ref": "${GIT_BRANCH}",
    "sha": "${SHA}",
    "repo": "${GH_USER}/${GH_REPO}"
  }
}
JSON
)

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  URL=$(node -e "try{const j=JSON.parse(require('fs').readFileSync('/tmp/vercel-deploy.json','utf8'));console.log(j.url||j.alias?.[0]||'(deployment created)')}catch(e){console.log('(deployment created)')}")
  echo "==> Vercel deploy started: https://${URL}"
  echo "    (May take 30–90s. Production alias updates once build succeeds.)"
else
  echo "==> Vercel API returned HTTP ${HTTP_CODE}:" >&2
  cat /tmp/vercel-deploy.json >&2
  echo "" >&2
  echo "    The git push to GitHub already succeeded; if a Vercel↔GitHub" >&2
  echo "    integration is configured, Vercel will auto-deploy from the push." >&2
  exit 1
fi

echo "==> Done."
