#!/usr/bin/env bash
# Apply the checked-out, reviewed Ansible configuration on a K3s node.
# The SSM launcher owns Git checkout, the concurrency lock, and health checks.
set -euo pipefail
umask 077

if [[ $# -ne 1 || ! "$1" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Expected one full lowercase Git commit SHA" >&2
  exit 2
fi
revision="$1"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
demo_dir="$(cd -- "$script_dir/../.." && pwd -P)"
repo_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
if [[ "$(git -C "$repo_dir" rev-parse HEAD)" != "$revision" ]]; then
  echo "Checked-out repository revision does not match requested SHA" >&2
  exit 1
fi
if [[ ! -f "$demo_dir/ansible/site.yml" ]]; then
  echo "Ansible playbook is missing from the checked-out revision" >&2
  exit 1
fi

exec > >(tee -a /var/log/aggregator-node-configure.log) 2>&1
echo "Applying Aggregator node configuration from $revision"

ansible_env=/opt/aggregator-ansible
if [[ ! -x "$ansible_env/bin/ansible-playbook" ]]; then
  python3.12 -m venv "$ansible_env"
  "$ansible_env/bin/python" -m pip install --disable-pip-version-check --no-input ansible-core==2.21.0
fi

export AGGREGATOR_REPO_ROOT="$repo_dir"
cd "$demo_dir/ansible"
"$ansible_env/bin/ansible-playbook" --inventory localhost, --connection local site.yml
echo "Ansible completed for $revision"
