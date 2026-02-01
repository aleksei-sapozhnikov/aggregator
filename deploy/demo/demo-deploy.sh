#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------
# Required environment variables
#
# SSH_HOST
#   DNS name or IP address of the demo VM.
#   Example:
#     SSH_HOST=ec2-0-0-0-0.eu-central-1.compute.amazonaws.com
#   or:
#     SSH_HOST=0.0.0.0
#
# SSH_PORT
#   SSH port exposed by the VM.
#   Example:
#     SSH_PORT=22
#
# SSH_USER
#   Remote user used for deployment.
#   Example:
#     SSH_USER=ec2-user
#
# SSH_KEY
#   Private SSH key (PEM / OpenSSH format) used to authenticate to the VM.
#   Must be provided as a multiline string (for example via GitHub Secrets).
#   Example:
#     SSH_KEY="-----BEGIN OPENSSH PRIVATE KEY-----
#     ...
#     -----END OPENSSH PRIVATE KEY-----"
#
# SSH_HOST_KEY
#   Public SSH host key of the remote VM in known_hosts format.
#   Used to verify server identity (prevents MITM).
#
#   For port 22:
#     ec2-0-0-0-0.eu-central-1.compute.amazonaws.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
#
#   For non-standard port (example 2222):
#     [ec2-0-0-0-0.eu-central-1.compute.amazonaws.com]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...
#
#   Can be obtained once with:
#     ssh-keyscan -p <port> <host>
#
# REPO_PATH
#   Absolute path to the repository on the remote VM.
#   The directory must already exist and contain the demo stack.
#   Example:
#     REPO_PATH=/home/ec2-user/aggregator-demo
#
# DEPLOY_BRANCH
#   Git branch to deploy on the demo environment.
#   Must exist in the remote repository.
#   Example:
#     DEPLOY_BRANCH=main
#   or:
#     DEPLOY_BRANCH=release/demo
# -------------------------------------------------------------------

: "${SSH_HOST:?Missing SSH_HOST}"
: "${SSH_PORT:?Missing SSH_PORT}"
: "${SSH_USER:?Missing SSH_USER}"
: "${SSH_KEY:?Missing SSH_KEY}"
: "${SSH_HOST_KEY:?Missing SSH_HOST_KEY}"
: "${REPO_PATH:?Missing REPO_PATH}"
: "${DEPLOY_BRANCH:?Missing DEPLOY_BRANCH}"

# -------------------------------------------------------------------
# Prepare SSH environment
# -------------------------------------------------------------------

mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Write private key used for authentication
printf '%s\n' "${SSH_KEY}" > ~/.ssh/demo_key
chmod 600 ~/.ssh/demo_key

# Pin remote host key (known_hosts)
printf '%s\n' "${SSH_HOST_KEY}" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts

# -------------------------------------------------------------------
# Deploy demo stack
# -------------------------------------------------------------------

ssh -i ~/.ssh/demo_key \
  -p "${SSH_PORT}" \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=~/.ssh/known_hosts \
  "${SSH_USER}@${SSH_HOST}" \
  "set -euo pipefail; \
   cd '${REPO_PATH}'; \
   git fetch --prune; \
   git checkout '${DEPLOY_BRANCH}'; \
   git reset --hard 'origin/${DEPLOY_BRANCH}'; \
   make demo-rebuild-recreate"
