#!/usr/bin/env bash
# Validate the K3s Ansible playbook and all demo workflow Bash scripts.
# Also checks the cloud-init wrapper syntax and ensures cloud-init does not
# run Ansible directly. Performs no AWS operations or remote configuration.
# Uses RUNNER_TEMP for its temporary Ansible environment.

set -euo pipefail

# Existing cloud-init wrappers still use the historical Ansible checkout path.
if [[ ! -L deploy/ansible ]] || [[ "$(readlink deploy/ansible)" != "../infra/demo/ansible" ]] || [[ ! -f deploy/ansible/site.yml ]]; then
  echo "The legacy Ansible symlink is missing or invalid" >&2
  exit 1
fi
python3 -m venv "$RUNNER_TEMP/ansible"
"$RUNNER_TEMP/ansible/bin/pip" install --disable-pip-version-check ansible-core==2.21.0
cd infra/demo/ansible
"$RUNNER_TEMP/ansible/bin/ansible-playbook" -i localhost, -c local --syntax-check site.yml
cd ../../..
bash -n infra/demo/ansible/dispatch-ssm.sh
bash -n infra/demo/node-configure.sh
sh -n infra/demo/ssm-node-configure.sh
# The remote script must invoke the version-owned entrypoint, not the installed legacy wrapper.
grep -Fq 'bash "$repo_dir/infra/demo/node-configure.sh" "$revision"' infra/demo/ssm-node-configure.sh
if grep -Fq '/usr/local/sbin/aggregator-node-configure' infra/demo/ssm-node-configure.sh; then
  echo "The SSM launcher must not depend on the cloud-init wrapper" >&2
  exit 1
fi
# Validate each workflow script independently; bash -n with multiple paths checks only the first.
for script in .github/scripts/demo-infra/*.sh .github/scripts/demo-deploy/*.sh; do
  bash -n "$script"
done
python3 -m py_compile deploy/argocd/argocd-admin-hash.py
python3 -m py_compile deploy/argocd/sync-argocd-password.py
python3 -m unittest discover -s deploy/argocd/tests -p 'test_*.py'
# The cloud-init wrapper must be valid Bash and never execute Ansible at boot.
"$RUNNER_TEMP/ansible/bin/python" - <<'PY'
import os
from pathlib import Path

import yaml

cloud_init = yaml.safe_load(
    Path("infra/demo/modules/ec2_k3s/cloud-init.yaml.tftpl").read_text(
        encoding="utf-8"
    )
)
if "runcmd" in cloud_init:
    raise SystemExit("K3s cloud-init must not run Ansible at boot")
wrappers = [
    item
    for item in cloud_init.get("write_files", [])
    if item.get("path") == "/usr/local/sbin/aggregator-node-configure"
]
if len(wrappers) != 1:
    raise SystemExit("K3s cloud-init must install exactly one Ansible wrapper")
Path(os.environ["RUNNER_TEMP"], "aggregator-node-configure.sh").write_text(
    wrappers[0]["content"], encoding="utf-8"
)
PY
bash -n "$RUNNER_TEMP/aggregator-node-configure.sh"
