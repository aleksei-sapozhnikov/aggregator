# Protected EC2 instance, IAM role, security group, and Elastic IP.

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

resource "aws_iam_role" "ec2" {
  name                 = coalesce(var.iam_role_name, "${var.resource_name_prefix}EC2Role")
  path                 = "/"
  description          = var.iam_role_description
  permissions_boundary = var.iam_permissions_boundary_arn
  max_session_duration = 3600
  assume_role_policy   = data.aws_iam_policy_document.ec2_assume_role.json
  tags                 = var.tags
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [tags]
  }
}

resource "aws_iam_instance_profile" "ec2" {
  name = coalesce(var.iam_role_name, "${var.resource_name_prefix}EC2Role")
  path = "/"
  role = aws_iam_role.ec2.name
  # Explicit overrides preserve existing tags; null inherits the module tags.
  tags = var.iam_instance_profile_tags == null ? var.tags : var.iam_instance_profile_tags
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "managed" {
  for_each   = var.iam_policies
  role       = aws_iam_role.ec2.name
  policy_arn = each.value
}

resource "aws_security_group" "instance_access" {
  name        = coalesce(var.security_group_name, "${var.name}-access")
  description = var.security_group_description
  vpc_id      = var.vpc_id
  tags        = var.tags
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [tags]
  }
}

resource "aws_vpc_security_group_ingress_rule" "rules" {
  for_each          = var.ingress_rules
  security_group_id = aws_security_group.instance_access.id
  cidr_ipv4         = each.value.cidr_ipv4
  from_port         = each.value.from_port
  ip_protocol       = each.value.ip_protocol
  to_port           = each.value.to_port
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "rules" {
  for_each          = var.egress_rules
  security_group_id = aws_security_group.instance_access.id
  cidr_ipv4         = each.value.cidr_ipv4
  ip_protocol       = each.value.ip_protocol
  from_port         = each.value.from_port
  to_port           = each.value.to_port
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "this" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  availability_zone      = var.availability_zone
  key_name               = var.key_name
  subnet_id              = var.subnet_id
  vpc_security_group_ids = [aws_security_group.instance_access.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  private_ip             = var.private_ip
  ebs_optimized          = var.ebs_optimized
  monitoring             = var.monitoring
  source_dest_check      = var.source_dest_check
  tenancy                = var.tenancy
  hibernation            = var.hibernation

  dynamic "capacity_reservation_specification" {
    for_each = var.capacity_reservation_preference == null ? [] : [var.capacity_reservation_preference]
    content {
      capacity_reservation_preference = capacity_reservation_specification.value
    }
  }

  dynamic "cpu_options" {
    for_each = var.cpu_options == null ? [] : [var.cpu_options]
    content {
      core_count       = cpu_options.value.core_count
      threads_per_core = cpu_options.value.threads_per_core
    }
  }

  dynamic "enclave_options" {
    for_each = var.enclave_enabled == null ? [] : [var.enclave_enabled]
    content {
      enabled = enclave_options.value
    }
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    http_protocol_ipv6          = "disabled"
    instance_metadata_tags      = "disabled"
  }
  dynamic "private_dns_name_options" {
    for_each = var.private_dns_name_options == null ? [] : [var.private_dns_name_options]
    content {
      hostname_type                        = private_dns_name_options.value.hostname_type
      enable_resource_name_dns_a_record    = private_dns_name_options.value.enable_resource_name_dns_a_record
      enable_resource_name_dns_aaaa_record = private_dns_name_options.value.enable_resource_name_dns_aaaa_record
    }
  }

  dynamic "maintenance_options" {
    for_each = var.maintenance_auto_recovery == null ? [] : [var.maintenance_auto_recovery]
    content {
      auto_recovery = maintenance_options.value
    }
  }

  root_block_device {
    delete_on_termination = true
    encrypted             = var.root_volume_encrypted
    iops                  = var.root_volume_iops
    throughput            = var.root_volume_throughput
    volume_size           = var.root_volume_size
    volume_type           = var.root_volume_type
    tags                  = var.root_volume_tags
  }
  tags        = merge(var.tags, { Name = var.name })
  volume_tags = var.volume_tags
  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = var.volume_tags == null || var.root_volume_tags == null
      error_message = "Specify either creation-time volume_tags or existing root_volume_tags, not both."
    }
  }
}

resource "aws_eip" "public" {
  domain               = "vpc"
  network_border_group = var.eip_network_border_group
  public_ipv4_pool     = "amazon"
  tags                 = var.tags
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [tags]
  }
}

resource "aws_eip_association" "public" {
  allocation_id        = aws_eip.public.id
  instance_id          = var.eip_association_method == "instance" ? aws_instance.this.id : null
  network_interface_id = var.eip_association_method == "network_interface" ? aws_instance.this.primary_network_interface_id : null
  private_ip_address = var.eip_association_method == "network_interface" ? (
    var.private_ip == null ? aws_instance.this.private_ip : var.private_ip
  ) : null
  allow_reassociation = false
  lifecycle {
    prevent_destroy = true
  }
}
