#!/bin/sh
# Phase 2: user-level bootstrap (must NOT run as root).
# Verifies docker access, clones/updates repo, generates certs, starts the demo stack.

set -eu

# -------- Config --------
REPO_URL="${REPO_URL:-https://github.com/aleksei-sapozhnikov/aggregator.git}"

BASE_DIR="${BASE_DIR:-$HOME/aggregator-demo}"
REPO_DIR="${REPO_DIR:-$BASE_DIR/repo}"
CERTS_DIR="${CERTS_DIR:-$BASE_DIR/deploy/certs}"

STATE_DIR="${STATE_DIR:-$BASE_DIR/.bootstrap}"
PHASE1_MARKER="$STATE_DIR/phase1.done"

SITE_IP="${SITE_IP:-}"
SITE_ADDRESS="${SITE_ADDRESS:-}"

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

# -------- Main --------
[ "$(id -u)" -ne 0 ] || die "Phase 2 must be run as a regular user (not root)."

[ -f "$PHASE1_MARKER" ] || die "Phase 1 marker not found: $PHASE1_MARKER. Run phase 1 first."

need_cmd git
need_cmd make
need_cmd openssl
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

log "==> Ensure certificates exist"
mkdir -p "$CERTS_DIR"

if [ -f "$CERTS_DIR/cert.pem" ] && [ -f "$CERTS_DIR/key.pem" ]; then
  log "==> Certificates already exist"
else
  [ -n "$SITE_IP" ] || die "SITE_IP is required to generate certs"
  [ -n "$SITE_ADDRESS" ] || die "SITE_ADDRESS is required to generate certs"

  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$CERTS_DIR/key.pem" \
    -out "$CERTS_DIR/cert.pem" \
    -subj "/CN=$SITE_ADDRESS" \
    -addext "subjectAltName=DNS:$SITE_ADDRESS,IP:$SITE_IP,IP:127.0.0.1"
fi

log "==> Start demo stack"
cd "$REPO_DIR"
make demo-up

log ""
printf '%s\n' "${GREEN}${BOLD}READY${RESET} - demo stack is up."
log "Local check: curl -vk https://127.0.0.1/"
log "Browser: https://$SITE_ADDRESS (self-signed cert warning expected)"
