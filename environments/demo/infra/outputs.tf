# Public endpoint and K3s instance. No legacy Compose resources remain.
output "elastic_ip_allocation_id" {
  description = "Protected public demo Elastic IP allocation."
  value       = aws_eip.public.allocation_id
}

output "elastic_ip_association_id" {
  description = "Current Elastic IP association with K3s."
  value       = aws_eip_association.public.id
}

output "elastic_ip_address" {
  description = "Public IPv4 address for aggregator.alivion.cc."
  value       = aws_eip.public.public_ip
}

output "k3s_instance_id" {
  description = "Public demo K3s EC2 instance ID."
  value       = module.aggregator_demo_k3s.instance_id
}

output "k3s_public_ip" {
  description = "K3s EC2 public IPv4 address (normally the Elastic IP)."
  value       = module.aggregator_demo_k3s.public_ip
}

output "k3s_security_group_id" {
  description = "K3s EC2 security group."
  value       = module.aggregator_demo_k3s.security_group_id
}
