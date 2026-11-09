# Keep the S3 bucket in configuration for the first destroy apply so the
# provider records force_destroy before the final bucket deletion.
resource "aws_s3_bucket" "publication" {
  bucket        = "aggregator-publication-data-905418096305-eu-central-1"
  force_destroy = true
}
