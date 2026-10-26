# Inputs for instance sizing, networking, access, and tags.

variable "name" {
  description = "Instance name tag and default resource name prefix."
  type        = string
}

variable "resource_name_prefix" {
  description = "Prefix for the default IAM role and instance profile names."
  type        = string
}

variable "ami_id" {
  description = "EC2 machine image ID."
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
}

variable "root_volume_size" {
  description = "Root EBS volume size in GiB."
  type        = number
}

variable "root_volume_type" {
  description = "Root EBS volume type."
  type        = string
  default     = "gp3"
}

variable "root_volume_encrypted" {
  description = "Encrypt the root EBS volume."
  type        = bool
  default     = true
}

variable "root_volume_iops" {
  description = "Provisioned root volume IOPS for gp3, io1, or io2."
  type        = number
  default     = null

  validation {
    condition     = var.root_volume_iops == null || contains(["gp3", "io1", "io2"], var.root_volume_type)
    error_message = "root_volume_iops can be set only for gp3, io1, or io2 volumes."
  }
}

variable "root_volume_throughput" {
  description = "Root gp3 volume throughput in MiB/s."
  type        = number
  default     = null

  validation {
    condition     = var.root_volume_throughput == null || var.root_volume_type == "gp3"
    error_message = "root_volume_throughput can be set only for gp3 volumes."
  }
}

variable "vpc_id" {
  description = "VPC for the instance security group."
  type        = string
}

variable "subnet_id" {
  description = "Subnet for the EC2 instance."
  type        = string
}

variable "availability_zone" {
  description = "Instance availability zone; null uses the selected subnet."
  type        = string
  default     = null
}

variable "private_ip" {
  description = "Fixed private IPv4 address; null lets AWS allocate one."
  type        = string
  default     = null
}

variable "key_name" {
  description = "Existing EC2 SSH key pair name."
  type        = string
  default     = null
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
  description = "Enable EBS optimization; null uses the instance default."
  type        = bool
  default     = null
}

variable "monitoring" {
  description = "Enable detailed EC2 monitoring; null uses the AWS default."
  type        = bool
  default     = null
}

variable "source_dest_check" {
  description = "Enable EC2 source and destination checks."
  type        = bool
  default     = true
}

variable "hibernation" {
  description = "Enable instance hibernation."
  type        = bool
  default     = false
}

variable "tenancy" {
  description = "EC2 placement tenancy."
  type        = string
  default     = "default"
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
  description = "Inbound IPv4 rules keyed by stable rule names."
  type        = map(object({ cidr_ipv4 = string, from_port = number, ip_protocol = string, to_port = number }))
  default     = {}
}

variable "egress_rules" {
  description = "Outbound IPv4 rules keyed by stable rule names."
  type        = map(object({ cidr_ipv4 = string, ip_protocol = string, from_port = optional(number), to_port = optional(number) }))
  default     = {}
}

variable "iam_policies" {
  description = "Managed policy ARNs keyed by stable caller-defined attachment names."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to module resources."
  type        = map(string)
  default     = {}
}

variable "volume_tags" {
  description = "EBS tags applied during instance creation (including the root volume). Do not combine with root_volume_tags."
  type        = map(string)
  default     = null
}

variable "root_volume_tags" {
  description = "Tags for an existing root volume. Do not combine with creation-time volume_tags."
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
  description = "Security group name; null derives it from the instance name."
  type        = string
  default     = null
}

variable "security_group_description" {
  description = "Security group description."
  type        = string
  default     = "Security group for EC2 instance"
}

variable "eip_network_border_group" {
  description = "Elastic IP network border group; null uses the region default."
  type        = string
  default     = null
}

variable "iam_role_name" {
  description = "IAM role and instance profile name; null uses resource_name_prefix."
  type        = string
  default     = null
}

variable "iam_role_description" {
  description = "EC2 workload role description."
  type        = string
  default     = "IAM role for EC2 instance"
}

variable "iam_permissions_boundary_arn" {
  description = "Optional permissions boundary for the EC2 IAM role."
  type        = string
  default     = null
}
