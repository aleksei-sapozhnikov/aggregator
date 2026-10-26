# Demo infrastructure

OpenTofu root for the serving demo's EC2 instance, workload role, networking,
and Elastic IP. Application deployment and Kubernetes installation are separate
operations. This directory can be used as a standalone repository.

## Contents

- `main.tf`: serving instance configuration and default VPC subnet lookup.
- `variables.tf`, `outputs.tf`: inputs and resource identifiers.
- `modules/ec2_legacy/`: protected resources for the serving instance.
- `modules/ec2_k3s/`: separate EC2 environment prepared for k3s; not enabled.
- `backend.tf`, `providers.tf`, `versions.tf`: state, AWS account, and tool versions.

## Usage

Use OpenTofu 1.12 or newer within the 1.x series and an AWS profile with demo
administration permissions, such as `aggregator-admin`. Set `AWS_PROFILE` for
your shell, then run from this directory:

```sh
tofu init
tofu validate
tofu plan
```

The configured account is `905418096305`, region `eu-central-1`.
State is stored under `demo/tofu.tfstate`. The backend bucket and referenced
managed IAM policies must already exist in AWS.

`enable_bedrock` grants the instance Bedrock model access and defaults to
`false`. `default_subnet_availability_zones` selects the default VPC subnet for
each instance.

## Checks

Use TFLint 0.65.0 with this directory's `.tflint.hcl`. These static checks
require no AWS credentials:

```sh
tofu fmt -check -recursive
tflint --init
tflint --recursive --config="$PWD/.tflint.hcl" --minimum-failure-severity=notice
```

## Operations

Review plans that replace or destroy the serving instance before applying.
The k3s module creates a separate environment and does not upgrade the serving
instance or install Kubernetes.

Keep state, saved plans, variable values, and credentials out of Git.
Commit `.terraform.lock.hcl` to preserve provider selections.

## SSM-based deployment

`ssm.tf` creates the limited `AggregatorDemoDeploy` Run Command document,
and the serving instance role receives `AmazonSSMManagedInstanceCore`.
The serving host must have an online SSM Agent at version 3.3.2746.0 or newer,
and outbound HTTPS access to Systems Manager.

Ingress is limited to HTTP/HTTPS. No SSH key, access rule, or compatibility
switch is configured. Review `tofu plan` before applying to an existing
instance; an unexpected EC2 replacement must not be approved.

## Interactive Session Manager access

The IAM `AggregatorDemoSessionAccess` policy authorizes interactive
sessions on `demo-aggregator` and the future `aggregator-demo-k3s` only.
Both use `ec2-user` on Amazon Linux 2023, via the
`SSMSessionRunAs=ec2-user` tag on `aggregator-admin`.

Enable **Run As support for Linux instances** in the regional Session
Manager preferences before testing. These settings are account-wide;
preserve any existing session logging, encryption and timeouts.
The k3s module never configures SSH keys or inbound TCP/22.
