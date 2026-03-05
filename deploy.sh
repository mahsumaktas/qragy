#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PM2_APP_NAME="${QRAGY_PM2_APP_NAME:-qragy}"
DEPLOY_REMOTE="${QRAGY_DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${QRAGY_DEPLOY_BRANCH:-$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)}"
BUILD_ADMIN_V2="${QRAGY_BUILD_ADMIN_V2:-0}"
RUN_NPM_INSTALL="${QRAGY_RUN_NPM_INSTALL:-0}"

log() {
  printf '[deploy] %s\n' "$1"
}

cd "$APP_DIR"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  log "fetching ${DEPLOY_REMOTE}"
  git fetch --prune "$DEPLOY_REMOTE"

  if [ "$DEPLOY_BRANCH" != "HEAD" ] && ! git show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
    if git show-ref --verify --quiet "refs/remotes/${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"; then
      log "creating local branch ${DEPLOY_BRANCH} from ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
      git checkout -B "$DEPLOY_BRANCH" "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
    fi
  fi

  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "working tree has tracked changes; skipping git update"
  elif [ "$DEPLOY_BRANCH" = "HEAD" ]; then
    log "detached HEAD; skipping git update"
  elif ! git show-ref --verify --quiet "refs/remotes/${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"; then
    log "remote branch ${DEPLOY_REMOTE}/${DEPLOY_BRANCH} not found; skipping git update"
  elif git merge-base --is-ancestor HEAD "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"; then
    if [ "$(git rev-parse HEAD)" != "$(git rev-parse "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}")" ]; then
      log "fast-forwarding to ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
      git merge --ff-only "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
    else
      log "already at latest ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
    fi
  elif git merge-base --is-ancestor "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}" HEAD; then
    log "local branch is ahead of ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}; keeping current checkout"
  else
    log "local branch diverged from ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}; skipping git update"
  fi
fi

if [ "$RUN_NPM_INSTALL" = "1" ] || [ ! -e "$APP_DIR/node_modules" ]; then
  log "installing runtime dependencies"
  npm install --omit=dev
fi

if [ "$BUILD_ADMIN_V2" = "1" ] && [ -f "$APP_DIR/admin-ui/package.json" ]; then
  log "building admin-v2"
  npm --prefix "$APP_DIR/admin-ui" run build
fi

log "restarting pm2 app ${PM2_APP_NAME}"
pm2 restart "$PM2_APP_NAME" --update-env

log "done"
