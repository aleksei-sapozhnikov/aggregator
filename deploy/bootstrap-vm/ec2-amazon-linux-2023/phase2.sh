#!/bin/sh
# Phase 2: user-level bootstrap (must NOT run as root).
# Verifies docker access, clones/updates repo.
# Does NOT start the demo stack automatically; prints next steps.

set -eu

# -------- Config --------
REPO_URL="${REPO_URL:-https://github.com/aleksei-sapozhnikov/aggregator.git}"

BASE_DIR="${BASE_DIR:-$HOME/aggregator-demo}"
REPO_DIR="${REPO_DIR:-$BASE_DIR/repo}"

STATE_DIR="${STATE_DIR:-$BASE_DIR/.bootstrap}"
PHASE1_MARKER="$STATE_DIR/phase1.done"

# Optional (only used for printing helpful next steps)
DOMAIN_NAME="${DOMAIN_NAME:-}"

# -------- Helpers --------
die() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
log() { printf '%s\n' "$*"; }

if [ -t 1 ]; then
  GREEN="$(printf '\033[32m')"
  BOLD="$(printf '\033[1m')"
  RESET="$(printf '\033[0m')"
else
  GREEN=""; BOLD=""; RESET=""
fi

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

print_next_steps() {
  log ""
  log "${BOLD}Phase 2 completed.${RESET}"
  log ""
  log "${BOLD}Next steps:${RESET}"
  log ""
  log "1) Ensure DNS A-record points to your Elastic IP:"
  if [ -n "$DOMAIN_NAME" ]; then
    log "   - $DOMAIN_NAME -> <elastic-ip>"
    log "   - www.$DOMAIN_NAME -> <elastic-ip> (optional)"
  else
    log "   - <your-domain> -> <elastic-ip>"
    log "   - www.<your-domain> -> <elastic-ip> (optional)"
  fi
  log ""
  log "2) Ensure AWS Security Group allows inbound:"
  log "   - TCP 80 (HTTP)"
  log "   - TCP 443 (HTTPS)"
  log ""
  log "3) Configure Caddyfile to use your domain (auto-TLS):"
  log "   - deploy/demo/Caddyfile should contain something like:"
  if [ -n "$DOMAIN_NAME" ]; then
    log "       $DOMAIN_NAME, www.$DOMAIN_NAME {"
  else
    log "       <your-domain>, www.<your-domain> {"
  fi
  log "         reverse_proxy grafana:3000"
  log "       }"
  log ""
  log "4) Start the demo stack:"
  log "   cd \"$REPO_DIR\""
  log "   make demo-up"
  log ""
  log "5) Check Caddy logs for certificate issuance:"
  log "   cd \"$REPO_DIR\""
  log "   docker compose logs -n 200 caddy"
  log ""
}

# -------- Main --------
[ "$(id -u)" -ne 0 ] || die "Phase 2 must be run as a regular user (not root)."

[ -f "$PHASE1_MARKER" ] || die "Phase 1 marker not found: $PHASE1_MARKER. Run phase 1 first."

need_cmd git
need_cmd make
need_cmd docker

log "==> Phase 2: user bootstrap"
log "Base dir: $BASE_DIR"
log "Repo dir: $REPO_DIR"

log "==> Verify docker is usable without sudo"
docker info >/dev/null 2>&1 || die "Docker is not accessible for user $USER. Reboot/re-login and try again."

log "==> Ensure repo is present"
if [ -d "$REPO_DIR/.git" ]; then
  (cd "$REPO_DIR" && git fetch --all --prune && git pull --ff-only)
else
  mkdir -p "$BASE_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi

print_next_steps
