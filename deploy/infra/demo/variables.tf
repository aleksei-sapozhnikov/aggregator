# Optional Bedrock access, K3s node, and availability zone selection.

variable "enable_bedrock" {
  description = "Allow the demo EC2 instance to invoke Bedrock models."
  type        = bool
  default     = false
}

variable "default_subnet_availability_zones" {
  description = "Availability Zone for each instance using the Default VPC's default subnet."
  type        = map(string)
  default = {
    aggregator_demo = "eu-central-1b"
  }
}

variable "enable_k3s_node" {
  description = "Opt in to provisioning the separate K3s EC2 instance and running its first-boot Ansible configuration."
  type        = bool
  default     = false
}

variable "k3s_instance_type" {
  description = "EC2 instance size for the optional K3s node."
  type        = string
  default     = "t3.medium"
}

variable "k3s_root_volume_size" {
  description = "Encrypted gp3 root volume size for the optional K3s node, in GiB."
  type        = number
  default     = 50
}

variable "k3s_bootstrap_git_ref" {
  description = "Git revision from which the K3s node runs its Ansible playbook. Prefer a full SHA for reproducibility."
  type        = string
  default     = "dev"
}
