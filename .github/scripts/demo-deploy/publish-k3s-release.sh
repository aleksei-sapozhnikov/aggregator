#!/usr/bin/env bash
# Promote a fully built demo release to the GitOps directory watched by Argo CD.
# Copies candidate manifests, pins eight GHCR image tags to RELEASE_SHA,
# validates Kustomize output, and pushes a new commit to the demo branch.
# Requires RELEASE_SHA, RUNNER_TEMP, and GITHUB_STEP_SUMMARY from GitHub Actions.

set -euo pipefail
[[ "$RELEASE_SHA" =~ ^[a-f0-9]{40}$ ]]
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Reject stale builds: do not promote a release after demo has advanced.
current_demo_sha="$(git ls-remote origin refs/heads/demo | cut -f1)"
if [[ "$current_demo_sha" != "$RELEASE_SHA" ]]; then
  echo "::error::demo advanced to $current_demo_sha; refusing to publish stale build $RELEASE_SHA."
  exit 1
fi

# Argo CD watches only this generated directory, not the candidate manifests.
# Copy from the exact revision used to build all eight GHCR images.
git switch --create published-k3s "$RELEASE_SHA"
rm -rf deploy/k8s-live
cp -a deploy/k8s deploy/k8s-live

# Match Grafana/Prometheus provisioning to the same source revision.
cp services-extra/grafana/dashboards/item_health_state.json deploy/k8s-live/item_health_state.json
cp services-extra/grafana/provisioning/dashboards/dashboards.yaml deploy/k8s-live/dashboards.yaml
cp services-extra/grafana/provisioning/datasources/prometheus.yaml deploy/k8s-live/prometheus.yaml
cp services-extra/prometheus/prometheus.yml deploy/k8s-live/prometheus.yml

python3 - "$RELEASE_SHA" <<'PY'
from pathlib import Path
import re
import sys

revision = sys.argv[1]
manifest = Path("deploy/k8s-live/kustomization.yaml")
content = manifest.read_text(encoding="utf-8")
updated, count = re.subn(
    r"(?m)^(\s*newTag: )[^\s]+$",
    lambda match: match.group(1) + revision,
    content,
)
if count != 8:
    raise SystemExit(f"Expected 8 image tags, found {count}")
manifest.write_text(updated, encoding="utf-8")
PY

kubectl kustomize deploy/k8s-live > "$RUNNER_TEMP/k3s-rendered.yaml"
if grep -q ':unpublished' "$RUNNER_TEMP/k3s-rendered.yaml"; then
  echo "::error::Unpublished image tags in the GitOps release."
  exit 1
fi

git add -A deploy/k8s-live
if git diff --cached --quiet; then
  echo "Published K3s manifests already match $RELEASE_SHA." >> "$GITHUB_STEP_SUMMARY"
else
  git commit -m "Publish K3s manifests for $RELEASE_SHA"
  # A non-fast-forward push must fail rather than overwrite a newer release.
  git push origin HEAD:refs/heads/demo
  echo "K3s release $RELEASE_SHA published to demo:deploy/k8s-live." >> "$GITHUB_STEP_SUMMARY"
fi
