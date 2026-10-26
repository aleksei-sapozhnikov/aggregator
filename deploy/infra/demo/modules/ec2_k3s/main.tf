# Separate EC2 node prepared for a k3s installation.

data "aws_caller_identity" "current" {}

data "aws_ami" "al2023" {
  owners = ["amazon"]

  filter {
    name   = "image-id"
    values = [var.ami_id]
  }

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

data "aws_iam_policy_document" "ec2_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

locals {
  name      = "aggregator-demo-k3s"
  role_name = "AggregatorDemoK3sEC2Role"
  base_tags = {
    Project     = "aggregator"
    Environment = "demo"
    ManagedBy   = "terraform"
    Component   = "k3s"
  }

  # Only public application ports; use Session Manager for administration.
  ingress = {
    http  = { port = 80, cidr = "0.0.0.0/0", description = "Public HTTP" }
    https = { port = 443, cidr = "0.0.0.0/0", description = "Public HTTPS" }
  }
}

resource "aws_iam_role" "ec2" {
  name                 = local.role_name
  description          = "IAM role for the Aggregator demo k3s EC2 node"
  assume_role_policy   = data.aws_iam_policy_document.ec2_assume_role.json
  permissions_boundary = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/AggregatorDemoRoleBoundary"
  tags                 = merge(local.base_tags, { Name = local.role_name })
}

resource "aws_iam_instance_profile" "ec2" {
  name = local.role_name
  role = aws_iam_role.ec2.name
  tags = merge(local.base_tags, { Name = local.role_name })
}

resource "aws_iam_role_policy_attachment" "bedrock" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/AggregatorCallBedrockModel"
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_security_group" "instance_access" {
  name        = "${local.name}-sg"
  description = "Ingress and egress for the Aggregator demo k3s node"
  vpc_id      = var.vpc_id
  tags        = merge(local.base_tags, { Name = "${local.name}-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "rules" {
  for_each          = local.ingress
  security_group_id = aws_security_group.instance_access.id
  cidr_ipv4         = each.value.cidr
  from_port         = each.value.port
  to_port           = each.value.port
  ip_protocol       = "tcp"
  description       = each.value.description
  tags              = merge(local.base_tags, { Name = "${local.name}-${each.key}" })
}

resource "aws_vpc_security_group_egress_rule" "all_ipv4" {
  security_group_id = aws_security_group.instance_access.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
  description       = "Required outbound access for AWS APIs and container images"
  tags              = merge(local.base_tags, { Name = "${local.name}-egress" })
}

resource "aws_instance" "this" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  # No SSH key pair; the SSM instance profile enables remote access.
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids = [aws_security_group.instance_access.id]
  source_dest_check      = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    http_protocol_ipv6          = "disabled"
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size
    encrypted             = true
    delete_on_termination = true
  }

  tags = merge(local.base_tags, { Name = local.name })

  # Creation-time EBS tags are required for IAM ABAC; do not use root_block_device.tags.
  volume_tags = merge(local.base_tags, { Name = "${local.name}-root" })

}

resource "aws_eip" "public" {
  domain = "vpc"
  tags   = merge(local.base_tags, { Name = "${local.name}-eip" })
}

resource "aws_eip_association" "public" {
  allocation_id       = aws_eip.public.id
  instance_id         = aws_instance.this.id
  allow_reassociation = false
}
