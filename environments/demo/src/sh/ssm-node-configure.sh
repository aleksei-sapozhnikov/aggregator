#!/bin/sh
# SSM Run Command entry point. Git revision is substituted by dispatch-ssm.sh.
# Keep this POSIX-compatible; AWS-RunShellScript invokes the system shell.
set -eu
revision="__CONFIGURATION_SHA__"
repo_dir=/opt/aggregator-node/repo
repo_url=https://github.com/aleksei-sapozhnikov/aggregator.git

if ! cloud-init status --wait; then
  cloud-init status --long || true
  exit 1
fi

# Serialize Git checkouts, Ansible execution, and K3s readiness checks.
exec 9>/run/lock/aggregator-node-configure.lock
flock -n 9 || { echo "Configuration is already running" >&2; exit 1; }

mkdir -p /opt/aggregator-node
if [ ! -d "$repo_dir/.git" ]; then
  mkdir -p "$repo_dir"
  git -C "$repo_dir" init -q
  git -C "$repo_dir" remote add origin "$repo_url"
fi
if [ "$(git -C "$repo_dir" remote get-url origin)" != "$repo_url" ]; then
  echo "Unexpected Git remote in node configuration checkout" >&2
  exit 1
fi

git -C "$repo_dir" fetch --depth 1 origin "$revision"
git -C "$repo_dir" checkout --force --detach FETCH_HEAD
if [ "$(git -C "$repo_dir" rev-parse HEAD)" != "$revision" ]; then
  echo "Fetched Git revision does not match the requested SHA" >&2
  exit 1
fi

# Everything tied to repository layout or Ansible is in the fetched revision.
test -f "$repo_dir/environments/demo/src/sh/node-configure.sh"
bash "$repo_dir/environments/demo/src/sh/node-configure.sh" "$revision"

systemctl is-active --quiet k3s
/usr/local/bin/k3s kubectl get --raw=/readyz
/usr/local/bin/k3s kubectl --namespace argocd rollout status deployment/argocd-server --timeout=180s
/usr/local/bin/k3s kubectl --namespace kube-system rollout status deployment/traefik --timeout=300s
# The Application is registered; demo-deploy publishes its manifests later.
/usr/local/bin/k3s kubectl -n argocd get application aggregator-demo >/dev/null

# Record successful configuration only after Ansible and readiness checks.
mkdir -p /var/lib/aggregator-node
printf '%s\n' "$revision" > /var/lib/aggregator-node/last-configured-revision
echo "K3s, Traefik and Argo CD configured at revision $revision"
