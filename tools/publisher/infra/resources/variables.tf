variable "permission_boundary_arn" {
  description = "ARN of the permissions boundary attached to Publisher workload roles."
  type        = string
  default     = "arn:aws:iam::905418096305:policy/AggregatorPublisherRoleBoundary"
}
