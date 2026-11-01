#!/usr/bin/env bash
# Publish the tested deployment to an independent GitOps branch.
# Source can be force-pushed; GitOps history is append-only.
set -euo pipefail
[[ "${RELEASE_SHA:?RELEASE_SHA is required}" =~ ^[a-f0-9]{40}$ ]]
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is required}"

source_branch="${SOURCE_BRANCH:-deploy/demo}"
gitops_branch="${GITOPS_BRANCH:-deploy/demo-gitops}"
[[ "$source_branch" == deploy/demo && "$gitops_branch" == deploy/demo-gitops ]] || {
  echo "::error::Unexpected deployment branch configuration" >&2
  exit 1
}

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Do not publish a stale build after another force push.
current_source_sha="$(git ls-remote origin "refs/heads/$source_branch" | cut -f1)"
if [[ "$current_source_sha" != "$RELEASE_SHA" ]]; then
  echo "::error::$source_branch advanced to $current_source_sha; refusing to publish stale build $RELEASE_SHA." >&2
  exit 1
fi

# Stage the release from the triggering source revision.
staged="$RUNNER_TEMP/staged-k8s-live"
rm -rf "$staged"
cp -a deploy/kubernetes "$staged"
cp services/grafana/dashboards/item_health_state.json "$staged/item_health_state.json"
cp services/grafana/provisioning/dashboards/dashboards.yaml "$staged/dashboards.yaml"
cp services/grafana/provisioning/datasources/prometheus.yaml "$staged/prometheus.yaml"
cp services/prometheus/prometheus.yml "$staged/prometheus.yml"

python3 deploy/demo/image_tags.py update-kustomization \
  --revision "$RELEASE_SHA" --manifest "$staged/kustomization.yaml"

kubectl kustomize "$staged" > "$RUNNER_TEMP/k3s-rendered.yaml"
if grep -q ':unpublished' "$RUNNER_TEMP/k3s-rendered.yaml"; then
  echo "::error::Unpublished image tags in the GitOps release." >&2
  exit 1
fi

# Use a separate worktree so the build checkout and its commit SHA stay intact.
git fetch --no-tags origin "refs/heads/$gitops_branch"
gitops_worktree="$RUNNER_TEMP/gitops-publish"
git worktree add --detach "$gitops_worktree" FETCH_HEAD
git -C "$gitops_worktree" config user.name "github-actions[bot]"
git -C "$gitops_worktree" config user.email "41898282+github-actions[bot]@users.noreply.github.com"

rm -rf "$gitops_worktree/deploy/k8s-live"
mkdir -p "$gitops_worktree/deploy"
cp -a "$staged" "$gitops_worktree/deploy/k8s-live"
git -C "$gitops_worktree" add -A -- deploy/k8s-live

if git -C "$gitops_worktree" diff --cached --quiet; then
  echo "Published GitOps manifests already match $RELEASE_SHA." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

git -C "$gitops_worktree" commit -m "Publish K3s manifests for $RELEASE_SHA"

# Reject concurrent GitOps writes rather than overwriting an approved release.
# A new workflow run may retry the publication against the updated branch.
current_source_sha="$(git ls-remote origin "refs/heads/$source_branch" | cut -f1)"
if [[ "$current_source_sha" != "$RELEASE_SHA" ]]; then
  echo "::error::$source_branch changed during promotion; refusing stale release." >&2
  exit 1
fi
git -C "$gitops_worktree" push origin "HEAD:refs/heads/$gitops_branch"
echo "K3s release $RELEASE_SHA published to $gitops_branch:deploy/k8s-live." >> "$GITHUB_STEP_SUMMARY"
