#!/usr/bin/env bash
# Validate demo bootstrap scripts and node configuration contracts.
# OpenTofu, Ansible syntax, and Ansible lint run through shared code_qa.
# This check makes no AWS calls and does not configure remote hosts.

set -euo pipefail

# Shared code_qa has already prepared the pinned Ansible environment.
ansible_python=".local/qa-runtime/ansible/venv/bin/python"
test -x "$ansible_python"
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
python3 -m py_compile tools/argocd/src/argocd_admin_hash.py
python3 -m py_compile tools/argocd/src/sync_argocd_password.py
python3 -m unittest discover -s tools/argocd/tests -p 'test_*.py'
# The EC2 bootstrap must remain independent of Git repository layout.
"$ansible_python" - <<'PY'
from pathlib import Path

import yaml

cloud_init = yaml.safe_load(
    Path("infra/demo/modules/ec2_k3s/cloud-init.yaml.tftpl").read_text(
        encoding="utf-8"
    )
)
if cloud_init.get("runcmd") or cloud_init.get("bootcmd") or cloud_init.get("write_files"):
    raise SystemExit("K3s cloud-init must only install prerequisites")
if not {"git", "python3.12", "python3.12-pip"}.issubset(
    set(cloud_init.get("packages", []))
):
    raise SystemExit("K3s cloud-init is missing required packages")
PY
# Shared code_qa runs the Ansible contract tests.
python3 -m unittest discover -s .github/scripts/demo-infra/tests -p 'test_*.py'
