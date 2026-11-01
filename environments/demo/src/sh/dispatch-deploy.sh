#!/usr/bin/env bash
# Request the existing demo-deploy workflow after infrastructure is ready.
# Checks the latest demo branch for a published K3s release and dispatches
# an application build only if sources changed or the first release is missing.
# Requires GH_TOKEN, APP_CHANGED, and GitHub Actions repository context.
# K3S_ENABLED (from the reviewed plan) suppresses initial K3s deployment
# after an intentional teardown, without blocking application code updates.
# K3S_DESTROYED stops all automatic application deployments in a teardown run.

set -euo pipefail
if [[ "$K3S_DESTROYED" == true ]]; then
  echo "K3s was destroyed by this plan; not dispatching application deployment during teardown." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

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
if [[ "$APP_CHANGED" != true ]]; then
  if [[ "$release_missing" != true ]]; then
    echo "No application changes and a K3s release already exists; no demo-deploy needed." >> "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
  if [[ "$K3S_ENABLED" == false ]]; then
    echo "K3s is disabled and no application code changed; skipping initial K3s deployment." >> "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
fi

# All builds, Compose deploys and K3s release promotion stay in demo-deploy.
gh api --method POST "repos/${GITHUB_REPOSITORY}/actions/workflows/demo-deploy.yml/dispatches" -f "ref=$source_branch"
echo "Requested demo-deploy after infrastructure stage (infra changed: $INFRA_CHANGED, app changed: $APP_CHANGED, initial release missing: $release_missing)." >> "$GITHUB_STEP_SUMMARY"
echo "The dispatched workflow reports application deployment success separately." >> "$GITHUB_STEP_SUMMARY"
