# Compute, networking, and IAM resource identifiers.

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.this.id
}

output "private_ip" {
  description = "Private IPv4 address."
  value       = aws_instance.this.private_ip
}

output "public_ip" {
  description = "Auto-assigned public IPv4 address; not an Elastic IP."
  value       = aws_instance.this.public_ip
}

output "security_group_id" {
  description = "Instance security group ID."
  value       = aws_security_group.instance_access.id
}

output "iam_role_arn" {
  description = "EC2 workload role ARN."
  value       = aws_iam_role.ec2.arn
}

output "iam_instance_profile_arn" {
  description = "EC2 instance profile ARN."
  value       = aws_iam_instance_profile.ec2.arn
}

output "root_volume_id" {
  description = "Root EBS volume ID."
  value       = aws_instance.this.root_block_device[0].volume_id
}
