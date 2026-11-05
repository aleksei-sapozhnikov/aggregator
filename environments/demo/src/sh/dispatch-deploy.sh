#!/usr/bin/env bash
# Request the existing demo-deploy workflow after infrastructure is ready.
# Compares the desired release snapshot with the published GitOps branch.
# Dispatches if sources changed, the release is missing, or manifests drifted.
# Requires GH_TOKEN, APP_CHANGED, and GitHub Actions repository context.
# The K3s infrastructure is always enabled and the public EIP is protected.

set -euo pipefail

# Read the independent GitOps branch, not the force-pushable source branch.
gitops_branch="${GITOPS_BRANCH:-deploy/demo-gitops}"
source_branch="${SOURCE_BRANCH:-deploy/demo}"
[[ "$gitops_branch" == deploy/demo-gitops && "$source_branch" == deploy/demo ]] || {
  echo "::error::Unexpected deployment branch configuration" >&2
  exit 1
}
git fetch --no-tags --depth=1 origin "refs/heads/$gitops_branch"
release_missing=false
if ! git cat-file -e FETCH_HEAD:deploy/k8s-live/kustomization.yaml 2>/dev/null; then
  release_missing=true
fi
release_outdated=false
if [[ "$APP_CHANGED" != true ]]; then
  if [[ "$release_missing" == false ]]; then
    # Compare the whole published snapshot, including image tags derived from
    # the current Git trees. Merely finding a kustomization.yaml is insufficient
    # when an earlier deployment failed before GitOps publication.
    comparison_dir="$(mktemp -d)"
    trap 'rm -rf "$comparison_dir"' EXIT
    staged="$comparison_dir/staged"
    published="$comparison_dir/published"
    mkdir -p "$published"
    bash environments/demo/src/sh/stage-kubernetes.sh "$staged"
    python3 environments/demo/src/python/image_tags.py update-kustomization \
      --revision "${GITHUB_SHA:?GITHUB_SHA is required}" \
      --manifest "$staged/kustomization.yaml"
    git archive FETCH_HEAD deploy/k8s-live | tar -xf - -C "$published"
    if ! diff -qr "$staged" "$published/deploy/k8s-live" >/dev/null; then
      release_outdated=true
      echo "Published GitOps release differs from the current desired snapshot." >> "$GITHUB_STEP_SUMMARY"
    else
      echo "No application changes; published GitOps release matches the current desired snapshot." >> "$GITHUB_STEP_SUMMARY"
      exit 0
    fi
  fi
fi

# Image publishing and K3s release promotion stay in demo-deploy.
gh api --method POST "repos/${GITHUB_REPOSITORY}/actions/workflows/demo-deploy.yml/dispatches" -f "ref=$source_branch"
echo "Requested demo-deploy after infrastructure stage (infra changed: $INFRA_CHANGED, app changed: $APP_CHANGED, initial release missing: $release_missing, GitOps snapshot outdated: $release_outdated)." >> "$GITHUB_STEP_SUMMARY"
echo "The dispatched workflow reports application deployment success separately." >> "$GITHUB_STEP_SUMMARY"
