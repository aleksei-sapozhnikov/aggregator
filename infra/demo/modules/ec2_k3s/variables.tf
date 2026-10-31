# Inputs for instance sizing, networking, and access.

variable "ami_id" {
  description = "Pinned Amazon Linux 2023 x86_64 AMI ID for eu-central-1."
  type        = string

  validation {
    condition     = can(regex("^ami-[0-9a-f]{8,17}$", var.ami_id))
    error_message = "ami_id must be a valid AMI ID."
  }
}

variable "vpc_id" {
  description = "Existing VPC where the dedicated instance security group is created."
  type        = string
}

variable "subnet_id" {
  description = "Existing public subnet that can route outbound internet traffic."
  type        = string
}

variable "instance_type" {
  description = "Supported EC2 instance size for the single-node k3s demo."
  type        = string
  default     = "t3.medium"

  validation {
    condition     = contains(["t3.medium", "t3.large", "t3.xlarge"], var.instance_type)
    error_message = "Select t3.medium, t3.large, or t3.xlarge for the demo cluster."
  }
}

variable "root_volume_size" {
  description = "Encrypted gp3 root EBS volume size in GiB."
  type        = number
  default     = 50

  validation {
    condition     = var.root_volume_size >= 40 && var.root_volume_size <= 200 && floor(var.root_volume_size) == var.root_volume_size
    error_message = "root_volume_size must be an integer between 40 and 200 GiB."
  }
}
