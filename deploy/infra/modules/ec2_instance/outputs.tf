output "instance_id" { value = aws_instance.this.id }
output "root_volume_id" { value = aws_instance.this.root_block_device[0].volume_id }
output "elastic_ip_allocation_id" { value = aws_eip.public.allocation_id }
output "elastic_ip_association_id" { value = aws_eip_association.public.id }
output "elastic_ip_address" { value = aws_eip.public.public_ip }
output "security_group_id" { value = aws_security_group.instance_access.id }
output "iam_role_arn" { value = aws_iam_role.ec2.arn }
output "iam_instance_profile_arn" { value = aws_iam_instance_profile.ec2.arn }
