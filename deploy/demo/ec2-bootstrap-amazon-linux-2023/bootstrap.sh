#!/bin/sh
# Wrapper that guides through phase 1 (root) and phase 2 (user).
# It does not attempt privilege escalation automatically to avoid hanging on sudo password prompts.

set -eu

TARGET_USER="${TARGET_USER:-ec2-user}"
BASE_DIR="${BASE_DIR:-/home/$TARGET_USER/aggregator-demo}"
STATE_DIR="${STATE_DIR:-$BASE_DIR/.bootstrap}"
PHASE1_MARKER="$STATE_DIR/phase1.done"

phase1="./bootstrap_phase1.sh"
phase2="./bootstrap_phase2.sh"

die() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
log() { printf '%s\n' "$*"; }

[ -f "$phase1" ] || die "Missing $phase1"
[ -f "$phase2" ] || die "Missing $phase2"

if [ "$(id -u)" -eq 0 ]; then
  # Running as root: run phase 1 unconditionally (idempotent), then instruct reboot.
  sh "$phase1"
  exit 0
fi

# Running as user
if [ -f "$PHASE1_MARKER" ]; then
  sh "$phase2"
else
  log "Phase 1 not completed yet."
  log "Run phase 1 as root first:"
  log "  sudo sh $phase1"
fi
