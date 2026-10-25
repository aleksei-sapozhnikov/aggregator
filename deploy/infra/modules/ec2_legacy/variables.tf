variable "name" { type = string }
variable "resource_name_prefix" { type = string }
variable "ami_id" { type = string }
variable "instance_type" { type = string }
variable "root_volume_size" { type = number }
variable "root_volume_type" {
  type    = string
  default = "gp3"
}
variable "root_volume_encrypted" {
  type    = bool
  default = true
}
variable "root_volume_iops" {
  type    = number
  default = null

  validation {
    condition     = var.root_volume_iops == null || contains(["gp3", "io1", "io2"], var.root_volume_type)
    error_message = "root_volume_iops can be set only for gp3, io1, or io2 volumes."
  }
}
variable "root_volume_throughput" {
  type    = number
  default = null

  validation {
    condition     = var.root_volume_throughput == null || var.root_volume_type == "gp3"
    error_message = "root_volume_throughput can be set only for gp3 volumes."
  }
}
variable "vpc_id" { type = string }
variable "subnet_id" { type = string }
variable "availability_zone" {
  type    = string
  default = null
}
variable "private_ip" {
  type    = string
  default = null
}
variable "key_name" {
  type    = string
  default = null
}
variable "cpu_options" {
  description = "Optional CPU topology. Omit to use the selected instance type's AWS defaults."
  type = object({
    core_count       = number
    threads_per_core = number
  })
  default = null
}
variable "ebs_optimized" {
  type    = bool
  default = null
}
variable "monitoring" {
  type    = bool
  default = null
}
variable "source_dest_check" {
  type    = bool
  default = true
}
variable "hibernation" {
  type    = bool
  default = false
}
variable "tenancy" {
  type    = string
  default = "default"
}
variable "capacity_reservation_preference" {
  description = "Optional EC2 capacity reservation preference. Omit to use AWS defaults."
  type        = string
  default     = null
}
variable "enclave_enabled" {
  description = "Optional Nitro Enclaves setting. Omit when not using enclaves."
  type        = bool
  default     = null
}
variable "private_dns_name_options" {
  description = "Optional EC2 private DNS hostname options. Omit to use AWS defaults."
  type = object({
    hostname_type                        = string
    enable_resource_name_dns_a_record    = bool
    enable_resource_name_dns_aaaa_record = bool
  })
  default = null
}
variable "maintenance_auto_recovery" {
  description = "Optional EC2 maintenance auto-recovery setting. Omit to use AWS defaults."
  type        = string
  default     = null
}
variable "ingress_rules" {
  type    = map(object({ cidr_ipv4 = string, from_port = number, ip_protocol = string, to_port = number }))
  default = {}
}
variable "egress_rules" {
  type    = map(object({ cidr_ipv4 = string, ip_protocol = string, from_port = optional(number), to_port = optional(number) }))
  default = {}
}
variable "iam_policies" {
  description = "Managed policy ARNs keyed by stable caller-defined attachment names."
  type        = map(string)
  default     = {}
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "volume_tags" {
  description = "EBS tags applied during instance creation (including the root volume). Do not combine with root_volume_tags."
  type        = map(string)
  default     = null
}
variable "root_volume_tags" {
  description = "Tags for an existing/imported root volume. Do not combine with creation-time volume_tags."
  type        = map(string)
  default     = null
}
variable "iam_instance_profile_tags" {
  description = "Optional override for instance profile tags; null inherits the module's project tags."
  type        = map(string)
  default     = null
}
variable "eip_association_method" {
  description = "Associate the Elastic IP using either the EC2 instance ID or its primary network interface."
  type        = string
  default     = "network_interface"

  validation {
    condition     = contains(["instance", "network_interface"], var.eip_association_method)
    error_message = "eip_association_method must be instance or network_interface."
  }
}
variable "security_group_name" {
  type    = string
  default = null
}
variable "security_group_description" {
  type    = string
  default = "Security group for EC2 instance"
}
variable "eip_network_border_group" {
  type    = string
  default = null
}
variable "iam_role_name" {
  type    = string
  default = null
}
variable "iam_role_description" {
  type    = string
  default = "IAM role for EC2 instance"
}
variable "iam_permissions_boundary_arn" {
  description = "Optional permissions boundary for the EC2 IAM role."
  type        = string
  default     = null
}
