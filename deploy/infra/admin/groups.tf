resource "aws_iam_group" "base" {
  name = "AggregatorBaseAccess"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group" "demo" {
  name = "AggregatorDemoAdmins"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_group" "publication" {
  name = "AggregatorPublicationAdmins"
  path = "/"

  lifecycle {
    prevent_destroy = true
  }
}
