#!/usr/bin/env bash
# Compare the desired K3s configuration with the last successful SSM record.
# The read-only plan role runs this after OpenTofu has opened the current state.
set -euo pipefail

python3 "$(dirname -- "${BASH_SOURCE[0]}")/src/config_fingerprint.py" check
