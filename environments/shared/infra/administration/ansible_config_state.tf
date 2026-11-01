# The demo pipeline compares node configuration against the last successful
# application, independently of branch history or GitOps manifests.
# The parameter is created/updated by the approved apply job after SSM succeeds.
locals {
  demo_ansible_config_parameter_arn = "arn:aws:ssm:eu-central-1:905418096305:parameter/aggregator/demo/ansible/last-successful-config-sha256"
}

resource "aws_iam_role_policy" "github_demo_infra_plan_config_fingerprint" {
  name = "AggregatorDemoReadAppliedAnsibleFingerprint"
  role = aws_iam_role.github_demo_infra_plan.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "ReadLastSuccessfulNodeConfiguration"
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = local.demo_ansible_config_parameter_arn
    }]
  })
}

resource "aws_iam_role_policy" "github_demo_infra_apply_config_fingerprint" {
  name = "AggregatorDemoRecordAppliedAnsibleFingerprint"
  role = aws_iam_role.github_demo_infra_apply.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "RecordLastSuccessfulNodeConfiguration"
      Effect   = "Allow"
      Action   = ["ssm:PutParameter"]
      Resource = local.demo_ansible_config_parameter_arn
    }]
  })
}
