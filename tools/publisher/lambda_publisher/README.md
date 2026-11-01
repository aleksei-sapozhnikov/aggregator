# Publication Lambda runtime

Python 3.12 AWS Lambda runtime for scheduled GitHub publication steps and
watchdog reconciliation. A scheduled invocation identifies an immutable
publication data revision and event; the watchdog can reconcile the active
queue revision. The runtime reads publication inputs from S3 and state from
DynamoDB before making permitted GitHub changes. It is not an interactive
job queue or part of the Product Health API.

## Configuration and release

The Lambda environment configured by
[publication infrastructure](../infra/README.md) supplies the S3 bucket,
DynamoDB table, credential secret ARNs, and activation/notification flags.
GitHub credentials are read from AWS Secrets Manager; missing or unreadable
configured secrets stop execution.

The repository keeps runtime source separate from packaging and operations.
Use [operator tools](../infra/tools/README.md) to package and preview code,
then explicitly confirm a release. The ZIP builder maps this source package
to `github_publication_runner`, matching Lambda's configured handler
`github_publication_runner.handler.lambda_handler`.
Do not edit the live Lambda code manually or run the handler locally with
production event data.

## Tests

From `tools/publisher/lambda_publisher` with Python 3.10+:

```sh
python -B -m unittest discover -s tests/lambda_publisher -p 'test_*.py'
```

The test suite uses local fixtures and mocks rather than live AWS or GitHub
calls. Check the EventBridge watchdog, CloudWatch logs, and DynamoDB state
through the [operator commands](../infra/tools/README.md) when diagnosing
missing or repeated publication events.
