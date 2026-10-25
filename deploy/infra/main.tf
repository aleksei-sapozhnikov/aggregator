data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  for_each = var.default_subnet_availability_zones

  vpc_id            = data.aws_vpc.default.id
  availability_zone = each.value
  default_for_az    = true
}

module "permissions" {
  source = "./modules/permissions"
}

module "aggregator_demo" {
  source = "./modules/ec2_instance"

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
  iam_policies               = var.enable_bedrock ? { bedrock = module.permissions.bedrock_policy_arn } : {}
  ingress_rules = {
    public_http  = { cidr_ipv4 = "0.0.0.0/0", from_port = 80, ip_protocol = "tcp", to_port = 80 }
    public_https = { cidr_ipv4 = "0.0.0.0/0", from_port = 443, ip_protocol = "tcp", to_port = 443 }
    public_ssh   = { cidr_ipv4 = "0.0.0.0/0", from_port = 22, ip_protocol = "tcp", to_port = 22 }
  }
  egress_rules = {
    all_ipv4 = { cidr_ipv4 = "0.0.0.0/0", ip_protocol = "-1" }
  }
}

# Example only: declare another independent instance by adding a module call.
# It gets its own role, profile, security group, and Elastic IP.
# module "ec2_new" {
#   source               = "./modules/ec2_instance"
#   name                 = "demo-secondary"
#   resource_name_prefix = "DemoSecondary"
#   ami_id               = "ami-0191d47ba10441f0b"
#   instance_type        = "t3.small"
#   root_volume_size     = 20
#   vpc_id               = data.aws_vpc.default.id
#   subnet_id            = data.aws_subnet.default["demo_secondary"].id
#   availability_zone    = var.default_subnet_availability_zones["demo_secondary"]
#   iam_policies         = { bedrock = module.permissions.bedrock_policy_arn }
#   # Private IP is omitted so AWS assigns a unique address.
#   # No SSH ingress is configured. If required, add a restricted rule:
#   # ingress_rules = {
#   #   admin_ssh = { cidr_ipv4 = var.admin_ssh_cidr, from_port = 22, ip_protocol = "tcp", to_port = 22 }
#   # }
# }
# Add "demo_secondary = \"eu-central-1a\"" to
# default_subnet_availability_zones before enabling this example. To use a
# non-default subnet or VPC, pass that VPC ID, subnet ID, and AZ explicitly.
