resource "aws_iam_user" "aggregator_admin" {
  name = "aggregator-admin"
  path = "/"
  tags = {}

  lifecycle {
    prevent_destroy = true
  }
}
