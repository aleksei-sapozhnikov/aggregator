# Aggregator Demo on AWS (Amazon Linux 2023)

This document describes how to deploy and run the Aggregator demo stack on an AWS EC2 instance using Amazon Linux 2023
and Docker Compose.

The result is a self-contained demo environment accessible over HTTPS.

---

## Prerequisites and configuration

- AWS EC2 instance
    - Instance type:
      [t3.micro](https://aws.amazon.com/ec2/instance-types/t3/)
    - Storage:
      [General purpose SSD gp3](https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html#gp3-ebs-volume-type)
    - Operating system: Amazon Linux 2023

- Public IPv4 address assigned

- Security Group allows inbound traffic on:
    - 22 (SSH)
    - 443 (HTTPS)

All commands below are executed as the `ec2-user` unless stated otherwise.

---

## 1. Base system update

```bash
sudo dnf update -y
```

---

## 2. Install Docker

```bash
sudo dnf install docker -y
sudo systemctl enable --now docker
sudo usermod -a -G docker ec2-user
```

Reboot the instance to apply group changes:

```bash
sudo reboot
```

After reconnecting, verify Docker installation:

```bash
docker info
docker version
```

---

## 3. Install Docker Compose plugin

Amazon Linux 2023 does not ship a recent Docker Compose plugin by default. Install it manually.

References:

* [https://docs.docker.com/compose/install/linux/#install-the-plugin-manually](https://docs.docker.com/compose/install/linux/#install-the-plugin-manually)
* [https://github.com/amazonlinux/amazon-linux-2023/issues/1032](https://github.com/amazonlinux/amazon-linux-2023/issues/1032)

```bash
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker}
mkdir -p $DOCKER_CONFIG/cli-plugins

curl -SL https://github.com/docker/compose/releases/download/v2.39.4/docker-compose-$(uname -s)-$(uname -m) \
  -o $DOCKER_CONFIG/cli-plugins/docker-compose

chmod +x $DOCKER_CONFIG/cli-plugins/docker-compose
```

Verify installation:

```bash
docker compose version
```

---

## 4. Install required tools

### Git

```bash
sudo dnf install git -y
```

### Make

```bash
sudo dnf install make -y
```

---

## 5. Prepare directories

Create a working directory for the demo and persistent data:

```bash
mkdir -p $HOME/aggregator-demo/data/grafana
mkdir -p $HOME/aggregator-demo/data/prometheus
```

Grafana runs as UID `472`, so fix ownership:

```bash
sudo chown -R 472:472 $HOME/aggregator-demo/data/grafana
```

---

## 6. Clone the repository

```bash
REPO_URL=https://github.com/aleksei-sapozhnikov/aggregator.git

cd $HOME/aggregator-demo
git clone $REPO_URL repo
cd repo
```

---

## 7. Generate self-signed TLS certificates

Certificates are required for HTTPS access to the demo.

```bash
mkdir -p deploy/certs
```

Set site IP and DNS name and generate certificates:

```bash
SITE_IP=63.180.71.231
SITE_ADDRESS=ec2-63-180-71-231.eu-central-1.compute.amazonaws.com

CERTS_DIR=$HOME/aggregator-demo/repo/deploy/certs

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout $CERTS_DIR/key.pem \
  -out $CERTS_DIR/cert.pem \
  -subj "/CN=$SITE_ADDRESS" \
  -addext "subjectAltName=DNS:$SITE_ADDRESS,IP:$SITE_IP,IP:127.0.0.1"
```

Verify Subject Alternative Names:

```bash
openssl x509 -in deploy/certs/cert.pem -noout -text | grep -A2 "Subject Alternative Name"
```

---

## 8. Run the demo stack

From the repository root:

```bash
cd $HOME/aggregator-demo/repo
make demo-up
```

This starts:

* Aggregator service
* Dummy services
* Prometheus
* Grafana
* Reverse proxy with TLS

---

## 9. Verify HTTPS access

Local TLS check:

```bash
curl -vk https://127.0.0.1/
```

Browser access:

```
https://<EC2_PUBLIC_DNS_NAME>/
```

A certificate warning is expected because the certificate is self-signed.

---

## Notes

* Intended for demo purposes only.
* Certificates are self-signed.
* No authentication is enabled.
* Persistence is limited to local Docker volumes.
