# The K3s EC2 is the sole public demo runtime.
variable "k3s_instance_type" {
  description = "EC2 instance size for the public K3s demo."
  type        = string
  default     = "t3.medium"
}

variable "k3s_root_volume_size" {
  description = "Encrypted gp3 root volume size for K3s in GiB."
  type        = number
  default     = 50
}
