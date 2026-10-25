locals {
  bedrock_inference_profile_arn = var.inference_profile_arn != null ? var.inference_profile_arn : "arn:aws:bedrock:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:inference-profile/${var.inference_profile_id}"
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "bedrock" {
  statement {
    sid       = "UseNovaLiteEUProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel", "bedrock:GetInferenceProfile"]
    resources = [local.bedrock_inference_profile_arn]
  }
  statement {
    sid       = "InvokeNovaLiteThroughEUProfile"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = var.foundation_model_arns
    condition {
      test     = "StringEquals"
      variable = "bedrock:InferenceProfileArn"
      values   = [local.bedrock_inference_profile_arn]
    }
  }
}

resource "aws_iam_policy" "bedrock" {
  name   = "AggregatorCallBedrockModel"
  path   = "/"
  policy = data.aws_iam_policy_document.bedrock.json
  lifecycle {
    prevent_destroy = true
    ignore_changes  = [tags]
  }
}

