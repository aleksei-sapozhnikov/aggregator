#!/usr/bin/env bash
# Assemble Kubernetes manifests using the single monitoring configuration sources.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <staging-directory>" >&2
  exit 2
fi

destination="$1"
repo_root="$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
if [[ -e "$destination" ]]; then
  echo "Staging destination already exists: $destination" >&2
  exit 1
fi

cp -a "$repo_root/deploy/kubernetes" "$destination"
cp "$repo_root/services/grafana/dashboards/item_health_state.json" "$destination/item_health_state.json"
cp "$repo_root/services/grafana/provisioning/dashboards/dashboards.yaml" "$destination/dashboards.yaml"
cp "$repo_root/services/grafana/provisioning/datasources/prometheus.yaml" "$destination/prometheus.yaml"
cp "$repo_root/services/prometheus/prometheus.yml" "$destination/prometheus.yml"
