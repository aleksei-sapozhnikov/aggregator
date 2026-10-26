# Compute and networking identifiers for the serving demo.

output "instance_id" {
  description = "Demo EC2 instance ID."
  value       = module.aggregator_demo.instance_id
}

output "root_volume_id" {
  description = "Root EBS volume represented by the instance root block device."
  value       = module.aggregator_demo.root_volume_id
}

output "elastic_ip_allocation_id" {
  description = "Elastic IP allocation ID."
  value       = module.aggregator_demo.elastic_ip_allocation_id
}

output "elastic_ip_association_id" {
  description = "Elastic IP association ID."
  value       = module.aggregator_demo.elastic_ip_association_id
}

output "elastic_ip_address" {
  description = "Existing public IPv4 address."
  value       = module.aggregator_demo.elastic_ip_address
}

output "security_group_id" {
  description = "Demo security group ID."
  value       = module.aggregator_demo.security_group_id
}

output "iam_role_arn" {
  description = "EC2 role ARN."
  value       = module.aggregator_demo.iam_role_arn
}

output "iam_instance_profile_arn" {
  description = "EC2 instance profile ARN."
  value       = module.aggregator_demo.iam_instance_profile_arn
}
