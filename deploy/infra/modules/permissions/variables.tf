variable "inference_profile_arn" {
  description = "Optional full Bedrock inference profile ARN. Defaults to the profile in the active AWS account and region."
  type        = string
  default     = null
}

variable "inference_profile_id" {
  description = "Bedrock inference profile ID used when inference_profile_arn is omitted."
  type        = string
  default     = "eu.amazon.nova-lite-v1:0"
}

variable "foundation_model_arns" {
  description = "Foundation model ARNs permitted through the inference profile."
  type        = list(string)
  default = [
    "arn:aws:bedrock:eu-central-1::foundation-model/amazon.nova-lite-v1:0",
    "arn:aws:bedrock:eu-north-1::foundation-model/amazon.nova-lite-v1:0",
    "arn:aws:bedrock:eu-west-1::foundation-model/amazon.nova-lite-v1:0",
    "arn:aws:bedrock:eu-west-3::foundation-model/amazon.nova-lite-v1:0",
  ]
}
