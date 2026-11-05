# The public demo runs on a single K3s node with a protected Elastic IP.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "default" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = "eu-central-1b"
  default_for_az    = true
}

module "aggregator_demo_k3s" {
  source = "./modules/ec2_k3s"

  ami_id           = "ami-03054abaec0c63e6e"
  instance_type    = var.k3s_instance_type
  root_volume_size = var.k3s_root_volume_size
  vpc_id           = data.aws_vpc.default.id
  subnet_id        = data.aws_subnet.default.id
}

# Preserve the public demo address across infrastructure updates.
resource "aws_eip" "public" {
  domain               = "vpc"
  network_border_group = "eu-central-1"
  public_ipv4_pool     = "amazon"
  tags = {
    Project     = "aggregator"
    Environment = "demo"
  }
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [tags]
  }
}

resource "aws_eip_association" "public" {
  allocation_id       = aws_eip.public.id
  instance_id         = module.aggregator_demo_k3s.instance_id
  allow_reassociation = true

  lifecycle {
    prevent_destroy = true
  }
}
