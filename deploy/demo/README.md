# Aggregator Demo

This document describes how to run and verify the Aggregator demo stack on a prepared host machine.

Virtual machine provisioning and OS-level setup are handled separately via platform-specific
bootstrap scripts under [deploy/bootstrap-vm](/deploy/bootstrap-vm).

---

## Demo stack overview

The demo stack is started using Docker Compose and includes:

- Aggregator service
- Dummy dependency services
- Prometheus
- Grafana
- Reverse proxy with HTTPS (self-signed TLS certificate)

---

## Prerequisites

- A host machine already bootstrapped for Docker Compose

- See [deploy/bootstrap-vm](/deploy/bootstrap-vm) for platform-specific instructions
- Inbound HTTPS access allowed to the host (port 443)
- Repository present on the host (typically under `~/aggregator-demo/repo`)

---

## Start the demo stack

From the repository root on the host machine:

```shell
cd ~/aggregator-demo/repo
make demo-up
```

---

## Verify access

### Local verification (on the host)

```shell
curl -vk https://127.0.0.1/
```

### Browser access

Open public DNS name (replace with the real one of your instance)

```
https://ec2-0-0-0-0...amazonaws.com
```

A certificate warning is expected because the TLS certificate is self-signed.

---

## Automated demo redeployment

The demo environment is redeployed automatically using GitHub Actions.

- Deployment trigger (when):

    - `.github/workflows/demo-deploy.yml`
- Deployment logic (how):

    - `deploy/demo/demo-deploy.sh`
