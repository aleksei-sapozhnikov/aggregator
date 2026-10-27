# EC2 node prepared on first boot by cloud-init; Ansible is invoked through SSM.

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
    http = { port = 80, cidr = "0.0.0.0/0", description = "Public HTTP" }
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

# SSM command output is retained for two weeks, including first-boot Ansible logs.
resource "aws_cloudwatch_log_group" "ssm" {
  name              = "/aws/ssm/aggregator-demo-k3s"
  retention_in_days = 14
  tags              = local.base_tags
}

data "aws_iam_policy_document" "ssm_logs" {
  statement {
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  statement {
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.ssm.arn}:*"]
  }
}

resource "aws_iam_role_policy" "ssm_logs" {
  name   = "AggregatorDemoK3sSsmLogs"
  role   = aws_iam_role.ec2.name
  policy = data.aws_iam_policy_document.ssm_logs.json
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
  ami                         = data.aws_ami.al2023.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  associate_public_ip_address = true
  # No SSH key pair; the SSM instance profile enables remote access.
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  vpc_security_group_ids      = [aws_security_group.instance_access.id]
  source_dest_check           = true
  user_data                   = templatefile("${path.module}/cloud-init.yaml.tftpl", {})
  user_data_replace_on_change = true

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

  # CloudWatch permissions must exist before SSM first runs during cloud-init.
  depends_on = [aws_iam_role_policy.ssm_logs]
}
