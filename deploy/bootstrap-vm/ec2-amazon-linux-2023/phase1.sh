#!/bin/sh
# Phase 1: system bootstrap (must run as root).
# - Updates OS packages
# - Installs required tools (idempotent)
# - Installs and enables Docker
# - Installs Docker Compose plugin into the target user's home (~/.docker/cli-plugins)
# - Prepares persistent directories and permissions (Grafana uid 472)
# - Adds target user to docker group (reboot/re-login required)
# - Writes a phase1 marker file

set -eu

# -----------------------------
# Configuration (override via env)
# -----------------------------
TARGET_USER="${TARGET_USER:-ec2-user}"
COMPOSE_VERSION="${COMPOSE_VERSION:-2.39.4}"

# Base working directory under target user's home
# (resolved dynamically via /etc/passwd; do not hardcode /home/<user> assumptions)
BASE_DIR="${BASE_DIR:-}"
DATA_DIR="${DATA_DIR:-}"
CERTS_DIR="${CERTS_DIR:-}"

STATE_DIR="${STATE_DIR:-}"
PHASE1_MARKER="${PHASE1_MARKER:-}"

# -----------------------------
# Helpers
# -----------------------------
log()  { printf '%s\n' "$*"; }
warn() { printf '%s\n' "WARN: $*" >&2; }
die()  { printf '%s\n' "ERROR: $*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

if [ -t 1 ]; then
  GREEN="$(printf '\033[32m')"
  BOLD="$(printf '\033[1m')"
  RESET="$(printf '\033[0m')"
else
  GREEN=""; BOLD=""; RESET=""
fi

# Compare semantic-ish versions (not full semver). Return 0 if $1 >= $2
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

# Safely resolve user's home directory
resolve_user_home() {
  u="$1"
  home="$(getent passwd "$u" | cut -d: -f6)"
  [ -n "$home" ] || die "Cannot resolve home for user: $u"
  printf '%s' "$home"
}

print_next_steps() {
  log ""
  log "================================================================="
  log "Phase 1 completed"
  log "================================================================="
  log ""
  log "Next steps:"
  log ""
  log "1) Reboot the machine:"
  log "   sudo reboot"
  log ""
  log "2) After reboot, run phase2 WITHOUT sudo."
  log "   Copy SITE_IP and SITE_ADDRESS from the EC2 instance page:"
  log ""
  log "   SITE_IP=<public-ip> SITE_ADDRESS=<public-dns> sh bootstrap_phase2.sh"
  log ""
}

# Ensure packages for missing commands in ONE dnf transaction (minimize prompts and conflicts).
# Notes for AL2023:
# - Prefer curl-minimal over curl to avoid conflicts.
ensure_packages() {
  missing_pkgs=""

  add_pkg_if_missing_cmd() {
    cmd="$1"
    pkg="$2"
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing_pkgs="$missing_pkgs $pkg"
    fi
  }

  add_pkg_if_missing_cmd git git
  add_pkg_if_missing_cmd make make
  add_pkg_if_missing_cmd openssl openssl

  # curl: prefer curl-minimal on Amazon Linux 2023 (avoid curl vs curl-minimal conflicts)
  if ! command -v curl >/dev/null 2>&1; then
    missing_pkgs="$missing_pkgs curl-minimal"
  fi

  # docker: CLI presence indicates the package; daemon will be enabled separately
  add_pkg_if_missing_cmd docker docker

  # shellcheck disable=SC2086
  set -- $missing_pkgs
  if [ "$#" -gt 0 ]; then
    log "==> Installing missing packages:$missing_pkgs"
    dnf install -y "$@"
  else
    log "==> All required packages are already installed"
  fi

  # Post-check for required commands (hard fail if still missing)
  need_cmd git
  need_cmd make
  need_cmd openssl
  need_cmd curl
  need_cmd docker
}

ensure_docker_service() {
  log "==> Enable and start Docker daemon"
  systemctl enable --now docker

  if systemctl is-active --quiet docker; then
    log "==> Docker service is active"
  else
    die "Docker service is not active after enabling/starting"
  fi
}

ensure_user_in_docker_group() {
  u="$1"
  log "==> Ensure $u is in docker group"
  if id -nG "$u" | tr ' ' '\n' | grep -qx docker; then
    log "==> $u is already in docker group"
  else
    usermod -a -G docker "$u"
    log "==> Added $u to docker group (reboot/re-login required)"
  fi
}

prepare_directories() {
  u="$1"
  log "==> Prepare directories and permissions"
  mkdir -p "$DATA_DIR/grafana" "$DATA_DIR/prometheus" "$CERTS_DIR" "$STATE_DIR"

  # Ownership for base dir to target user
  chown -R "$u:$u" "$BASE_DIR"

  # Grafana official image runs as uid 472
  chown -R 472:472 "$DATA_DIR/grafana"
}

write_phase1_marker() {
  u="$1"
  log "==> Write phase 1 marker"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$PHASE1_MARKER"
  chown "$u:$u" "$PHASE1_MARKER"
}

# Install/update Docker Compose plugin into target user's ~/.docker/cli-plugins
ensure_compose_plugin_for_user() {
  u="$1"
  u_home="$(resolve_user_home "$u")"

  docker_config="${DOCKER_CONFIG:-$u_home/.docker}"
  plugin_dir="$docker_config/cli-plugins"
  plugin_bin="$plugin_dir/docker-compose"

  mkdir -p "$plugin_dir"
  chown -R "$u:$u" "$docker_config"

  # Decide whether we need to (re)install plugin:
  # - If plugin file missing: install
  # - If present and version is >= desired: skip
  # - If present but docker compose cannot run yet (group not applied): keep existing
  need_install="true"

  if [ -x "$plugin_bin" ]; then
    if su - "$u" -c "docker compose version" >/dev/null 2>&1; then
      current="$(su - "$u" -c "docker compose version" 2>/dev/null | awk '{print $NF}' | sed 's/^v//')"
      if [ -n "$current" ] && version_ge "$current" "$COMPOSE_VERSION"; then
        need_install="false"
        log "==> docker compose is present for $u: v$current"
      else
        warn "docker compose present but too old for $u (v${current:-unknown}); will install v$COMPOSE_VERSION"
      fi
    else
      need_install="false"
      log "==> docker compose plugin file exists for $u (version check deferred until phase 2)"
    fi
  fi

  if [ "$need_install" = "false" ]; then
    return 0
  fi

  os="$(uname -s)"
  arch="$(uname -m)"
  url="https://github.com/docker/compose/releases/download/v$COMPOSE_VERSION/docker-compose-$os-$arch"

  log "==> Installing Docker Compose plugin for $u (v$COMPOSE_VERSION)"
  log "==> Download: $url"

  curl -fsSL "$url" -o "$plugin_bin"
  chmod +x "$plugin_bin"
  chown "$u:$u" "$plugin_bin"

  [ -x "$plugin_bin" ] || die "Compose plugin is not executable after install: $plugin_bin"
  log "==> Compose plugin installed at: $plugin_bin"
}

# -----------------------------
# Main
# -----------------------------
[ "$(id -u)" -eq 0 ] || die "Phase 1 must be run as root. Use: sudo sh bootstrap_phase1.sh"

need_cmd dnf
need_cmd systemctl
need_cmd getent
need_cmd su
need_cmd id
need_cmd awk
need_cmd sed
need_cmd uname

# Validate target user exists early
getent passwd "$TARGET_USER" >/dev/null 2>&1 || die "User does not exist: $TARGET_USER"

TARGET_HOME="$(resolve_user_home "$TARGET_USER")"

# Resolve paths if not provided
BASE_DIR="${BASE_DIR:-$TARGET_HOME/aggregator-demo}"
DATA_DIR="${DATA_DIR:-$BASE_DIR/data}"
CERTS_DIR="${CERTS_DIR:-$BASE_DIR/deploy/certs}"
STATE_DIR="${STATE_DIR:-$BASE_DIR/.bootstrap}"
PHASE1_MARKER="${PHASE1_MARKER:-$STATE_DIR/phase1.done}"

log "==> Phase 1: system bootstrap"
log "Target user: $TARGET_USER"
log "Target home: $TARGET_HOME"
log "Base dir: $BASE_DIR"

log "==> System update"
dnf update -y

log "==> Ensure required packages and commands"
ensure_packages

ensure_docker_service
ensure_user_in_docker_group "$TARGET_USER"
prepare_directories "$TARGET_USER"

log "==> Ensure Docker Compose plugin for $TARGET_USER"
ensure_compose_plugin_for_user "$TARGET_USER"

write_phase1_marker "$TARGET_USER"
print_next_steps
