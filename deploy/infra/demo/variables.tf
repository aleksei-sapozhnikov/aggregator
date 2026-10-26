# Optional Bedrock access and availability zone selection.

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

variable "enable_legacy_ssh" {
  description = "Retain legacy SSH ingress during SSM cutover. Disable after SSM is verified."
  type        = bool
  default     = true
}
