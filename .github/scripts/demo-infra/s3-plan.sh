#!/usr/bin/env bash
# Transfer the exact, sensitive OpenTofu plan between approved GitHub jobs.
# Plan content stays in a private versioned S3 bucket, never a public artifact.
set -euo pipefail
umask 077

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_RUN_ATTEMPT:?GITHUB_RUN_ATTEMPT is required}"
: "${AWS_REGION:?AWS_REGION is required}"

[[ "$GITHUB_RUN_ID" =~ ^[0-9]+$ && "$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+$ ]] || {
  echo "Invalid GitHub run ID or attempt" >&2
  exit 2
}

bucket="aggregator-tofu-state-905418096305-eu-central-1"
key="plans/demo/${GITHUB_RUN_ID}/${GITHUB_RUN_ATTEMPT}/demo.tfplan"
export AWS_PAGER=""

case "${1:-}" in
  upload)
    : "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
    plan="$RUNNER_TEMP/demo.tfplan"
    [[ -s "$plan" ]] || { echo "Saved OpenTofu plan is missing" >&2; exit 1; }
    checksum="$(sha256sum "$plan" | cut -d ' ' -f 1)"

    # Conditional PutObject rejects an existing key. The bucket policy and
    # planning role also enforce conditional, write-once S3 uploads.
    aws s3api put-object \
      --region "$AWS_REGION" \
      --bucket "$bucket" \
      --key "$key" \
      --body "$plan" \
      --if-none-match '*' \
      --server-side-encryption AES256 \
      --output json > /dev/null

    printf 'plan_sha256=%s\n' "$checksum" >> "$GITHUB_OUTPUT"
    echo "Saved approved plan privately in s3://$bucket/$key"
    echo "SHA-256: $checksum"
    ;;
  download)
    : "${EXPECTED_PLAN_SHA256:?EXPECTED_PLAN_SHA256 is required}"
    [[ "$EXPECTED_PLAN_SHA256" =~ ^[a-f0-9]{64}$ ]] || {
      echo "Invalid expected plan SHA-256 job output" >&2
      exit 2
    }
    target="$RUNNER_TEMP/approved-plan/demo.tfplan"
    mkdir -p "$(dirname "$target")"

    aws s3api get-object \
      --region "$AWS_REGION" \
      --bucket "$bucket" \
      --key "$key" \
      "$target" > /dev/null

    checksum="$(sha256sum "$target" | cut -d ' ' -f 1)"
    if [[ "$checksum" != "$EXPECTED_PLAN_SHA256" ]]; then
      rm -f "$target"
      echo "S3 plan SHA-256 mismatch; refusing to apply" >&2
      exit 1
    fi
    echo "Verified the downloaded S3 plan against the Plan job SHA-256"
    ;;
  *)
    echo "Usage: $0 upload|download" >&2
    exit 2
    ;;
esac
