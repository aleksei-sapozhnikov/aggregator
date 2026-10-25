resource "aws_iam_user_group_membership" "aggregator_admin" {
  user = aws_iam_user.aggregator_admin.name
  groups = [
    aws_iam_group.base.name,
    aws_iam_group.demo.name,
    aws_iam_group.publication.name,
  ]

  lifecycle {
    prevent_destroy = true
  }
}
