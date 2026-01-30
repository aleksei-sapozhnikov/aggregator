# VM Bootstrap on AWS EC2 (Amazon Linux 2023)

This directory contains scripts and instructions to initialize an AWS EC2 virtual machine
running Amazon Linux 2023 so it can later run the Aggregator demo stack.

The bootstrap is intentionally split into two phases to separate system-level changes from user-level setup.

---

## Bootstrap phases

### Phase 1 — system bootstrap (root)

Run [phase1.sh](phase1.sh) once after instance creation. Must be executed as `root`.

```shell
sudo sh phase1.sh
```

At the end of Phase 1 you **must reboot** the machine to apply group membership cleanly.

---

### Reboot

sudo reboot

Reconnect over SSH after the reboot.

---

### Phase 2 — user bootstrap (regular user)

Run [phase2.sh](phase2.sh) as a regular user (default: `ec2-user`). **Do not use sudo**.

You must provide the following environment variables:

* `SITE_IP` — EC2 instance Public IPv4 address
* `SITE_ADDRESS` — EC2 instance Public IPv4 DNS name

These values can be found in:
AWS Console → EC2 → Instances → select instance → Details.

Run:

```shell
SITE_IP=<public-ip> SITE_ADDRESS=<public-dns> sh phase2.sh

# SITE_IP=0.0.0.0 SITE_ADDRESS=https://ec2-0-0-0-0....amazonaws.com sh phase2.sh
```

## Resulting layout

After successful bootstrap, the following directories exist:

* `~/aggregator-demo/repo` — repository checkout
* `~/aggregator-demo/deploy/certs` — TLS certificates
* `~/aggregator-demo/data` — persistent demo data
* `~/aggregator-demo/.bootstrap/phase1.done` — phase 1 marker

---

## Next steps

Once the VM is bootstrapped, follow the demo-specific
instructions in [deploy/demo/README.md](/deploy/demo/README.md)
