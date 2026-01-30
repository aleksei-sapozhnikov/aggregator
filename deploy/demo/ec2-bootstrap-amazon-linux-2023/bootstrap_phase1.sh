#!/bin/sh
# Phase 1: system bootstrap (must run as root).
# Installs Docker, tools, Docker Compose plugin, and prepares directories/permissions.
# Adds the target user to the 'docker' group (reboot/re-login required).

set -eu

# -------- Config --------
TARGET_USER="${TARGET_USER:-ec2-user}"
COMPOSE_VERSION="${COMPOSE_VERSION:-2.39.4}"

BASE_DIR="${BASE_DIR:-/home/$TARGET_USER/aggregator-demo}"
DATA_DIR="${DATA_DIR:-$BASE_DIR/data}"
CERTS_DIR="${CERTS_DIR:-$BASE_DIR/deploy/certs}"

STATE_DIR="${STATE_DIR:-$BASE_DIR/.bootstrap}"
PHASE1_MARKER="$STATE_DIR/phase1.done"

# -------- Helpers --------
die() { printf '%s\n' "ERROR: $*" >&2; exit 1; }
log() { printf '%s\n' "$*"; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

version_ge() {
  v1="$1"; v2="$2"
  awk -v a="$v1" -v b="$v2" '
    function splitver(v, arr,   n,i) { n=split(v,arr,"."); for(i=n+1;i<=4;i++) arr[i]=0; return 4 }
    BEGIN {
      splitver(a,A); splitver(b,B);
      for(i=1;i<=4;i++){
        if((A[i]+0)>(B[i]+0)) exit 0;
        if((A[i]+0)<(B[i]+0)) exit 1;
      }
      exit 0
    }' >/dev/null 2>&1
}

ensure_compose_plugin() {
  # Install compose plugin into target user's home: /home/<user>/.docker/cli-plugins/docker-compose
  target_home="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  [ -n "$target_home" ] || die "Cannot resolve home for user: $TARGET_USER"

  docker_config="$target_home/.docker"
  plugin_dir="$docker_config/cli-plugins"
  plugin_bin="$plugin_dir/docker-compose"

  mkdir -p "$plugin_dir"
  chown -R "$TARGET_USER:$TARGET_USER" "$docker_config"

  # Check existing version (as target user) if present
  compose_ok="false"
  if su - "$TARGET_USER" -c "docker compose version" >/dev/null 2>&1; then
    current="$(su - "$TARGET_USER" -c "docker compose version" 2>/dev/null | awk '{print $NF}' | sed 's/^v//')"
    if [ -n "$current" ] && version_ge "$current" "$COMPOSE_VERSION"; then
      compose_ok="true"
      log "==> docker compose present for $TARGET_USER: v$current"
    else
      log "==> docker compose too old for $TARGET_USER (v${current:-unknown}); installing v$COMPOSE_VERSION"
    fi
  else
    log "==> docker compose not found for $TARGET_USER; installing v$COMPOSE_VERSION"
  fi

  if [ "$compose_ok" = "true" ]; then
    return 0
  fi

  os="$(uname -s)"
  arch="$(uname -m)"
  url="https://github.com/docker/compose/releases/download/v$COMPOSE_VERSION/docker-compose-$os-$arch"

  log "==> Download Compose plugin: $url"
  need_cmd curl
  curl -fsSL "$url" -o "$plugin_bin"
  chmod +x "$plugin_bin"
  chown "$TARGET_USER:$TARGET_USER" "$plugin_bin"

  # Verify (will still fail until docker group is applied, but binary should exist)
  if su - "$TARGET_USER" -c "test -x '$plugin_bin'"; then
    log "==> Compose plugin installed at $plugin_bin"
  else
    die "Compose plugin installation failed"
  fi
}

# -------- Main --------
[ "$(id -u)" -eq 0 ] || die "Phase 1 must be run as root. Use: sudo sh bootstrap_phase1.sh"

need_cmd dnf

log "==> Phase 1: system bootstrap"
log "Target user: $TARGET_USER"
log "Base dir: $BASE_DIR"

log "==> Update system and install tools"
dnf update -y
dnf install -y git make curl openssl

log "==> Install and enable Docker"
dnf install -y docker
systemctl enable --now docker

log "==> Add user to docker group (if needed)"
if id -nG "$TARGET_USER" | tr ' ' '\n' | grep -qx docker; then
  log "==> $TARGET_USER already in docker group"
else
  usermod -a -G docker "$TARGET_USER"
  log "==> Added $TARGET_USER to docker group"
fi

log "==> Prepare directories"
mkdir -p "$DATA_DIR/grafana" "$DATA_DIR/prometheus" "$CERTS_DIR" "$STATE_DIR"
chown -R "$TARGET_USER:$TARGET_USER" "$BASE_DIR"
# Grafana official image runs as uid 472
chown -R 472:472 "$DATA_DIR/grafana"

log "==> Ensure Docker Compose plugin"
ensure_compose_plugin

# Mark phase 1 done
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$PHASE1_MARKER"
chown "$TARGET_USER:$TARGET_USER" "$PHASE1_MARKER"

log ""
log "Phase 1 completed."
log "Next step: reboot (or re-login) to apply docker group membership, then run phase 2 as $TARGET_USER:"
log "  sudo reboot"
log "  sh bootstrap_phase2.sh"
