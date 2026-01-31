# VM Bootstrap on AWS EC2 (Amazon Linux 2023)

This directory contains scripts to bootstrap an AWS EC2 instance
running Amazon Linux 2023 so it can host the Aggregator demo environment.

The bootstrap is split into two phases:

* **Phase 1** — system-level setup (root)
* **Phase 2** — user-level setup (regular user)

---

## Prerequisites

* AWS EC2 instance with **Amazon Linux 2023**
* SSH access
* Outbound internet access
* Inbound access configured later for demo (80 / 443)

---

## Bootstrap flow (recommended order)

### 1. Phase 1 — system bootstrap (root)

Run once after instance creation.

```sh
sudo sh phase1.sh
```

Phase 1 performs:

* System update
* Installation of required packages
* Docker installation and enablement
* Docker Compose plugin installation for the target user
* Directory preparation and permissions
* Writes a phase 1 marker file

At the end of Phase 1 you **must reboot** the machine.

---

### 2. Reboot the instance

```sh
sudo reboot
```

Reconnect over SSH after the reboot.

---

### 3. Phase 2 — user bootstrap (regular user)

Run as a regular user (default: `ec2-user`). **Do not use sudo**.

```sh
sh phase2.sh
```

Phase 2 performs:

* Verification that Docker is usable without sudo
* Clone or update of the Aggregator repository
* Prints demo-specific next steps

> Phase 2 does **not** start the demo stack automatically.

---

## Resulting layout

After a successful bootstrap, the following structure exists:

* `~/aggregator-demo/repo` — Aggregator repository checkout
* `~/aggregator-demo/.bootstrap/phase1.done` — phase 1 completion marker

---

## Next steps

Demo-specific configuration and startup instructions are intentionally **not duplicated here**.

Follow the instructions printed at the end of `phase2.sh`, then continue with:

[deploy/demo/README.md](/deploy/demo/README.md)
