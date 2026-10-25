data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  for_each = var.default_subnet_availability_zones

  vpc_id            = data.aws_vpc.default.id
  availability_zone = each.value
  default_for_az    = true
}

# Move the shared Bedrock policy to the independent admin state.
# This block forgets the old module in demo state without deleting its AWS policy.
removed {
  from = module.permissions

  lifecycle {
    destroy = false
  }
}

module "aggregator_demo" {
  source = "../modules/ec2_legacy"

  name                   = "demo-aggregator"
  resource_name_prefix   = "AggregatorDemo"
  ami_id                 = "ami-0191d47ba10441f0b"
  instance_type          = "t3.small"
  root_volume_size       = 20
  root_volume_type       = "gp3"
  root_volume_encrypted  = false
  root_volume_iops       = 3000
  root_volume_throughput = 125
  vpc_id                 = data.aws_vpc.default.id
  subnet_id              = data.aws_subnet.default["aggregator_demo"].id
  availability_zone      = var.default_subnet_availability_zones["aggregator_demo"]
  private_ip             = "172.31.47.85"
  key_name               = "Demo Aggregator"
  cpu_options = {
    core_count       = 1
    threads_per_core = 2
  }
  ebs_optimized                   = true
  monitoring                      = false
  source_dest_check               = true
  hibernation                     = false
  tenancy                         = "default"
  capacity_reservation_preference = "open"
  enclave_enabled                 = false
  private_dns_name_options = {
    hostname_type                        = "ip-name"
    enable_resource_name_dns_a_record    = true
    enable_resource_name_dns_aaaa_record = false
  }
  maintenance_auto_recovery  = "default"
  security_group_name        = "launch-wizard-1"
  security_group_description = "launch-wizard-1 created 2026-01-30T20:09:09.998Z"
  eip_network_border_group   = "eu-central-1"
  iam_role_name              = "AggregatorDemoEC2Role"
  iam_role_description       = "IAM role for the Aggregator demo EC2 instance"
  iam_policies               = var.enable_bedrock ? { bedrock = "arn:aws:iam::905418096305:policy/AggregatorCallBedrockModel" } : {}
  ingress_rules = {
    public_http  = { cidr_ipv4 = "0.0.0.0/0", from_port = 80, ip_protocol = "tcp", to_port = 80 }
    public_https = { cidr_ipv4 = "0.0.0.0/0", from_port = 443, ip_protocol = "tcp", to_port = 443 }
    public_ssh   = { cidr_ipv4 = "0.0.0.0/0", from_port = 22, ip_protocol = "tcp", to_port = 22 }
  }
  egress_rules = {
    all_ipv4 = { cidr_ipv4 = "0.0.0.0/0", ip_protocol = "-1" }
  }
  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
  # Imported root volume: preserve the tags already applied in AWS.
  # Do not set volume_tags on the existing instance (creation-time only).
  root_volume_tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
  # The existing IAM instance profile is currently untagged.
  # Preserve it as-is; future instances use module tags automatically.
  iam_instance_profile_tags = {}
}

# module "aggregator_demo_k3s" {
#   source = "../modules/ec2_k3s"
#   ami_id        = "ami-03054abaec0c63e6e"
#   instance_type = "t3.medium"
#   vpc_id    = data.aws_vpc.default.id
#   subnet_id = data.aws_subnet.default["aggregator_demo"].id
# }
