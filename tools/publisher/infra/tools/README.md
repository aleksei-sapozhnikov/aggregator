# Publication operator tools

Local Python commands for safely building and releasing the publication Lambda,
inspecting AWS notifications, and writing GitHub tokens to Secrets Manager.
They are independent of the Lambda runtime and do not change the publication
queue.

Use Python 3.10+, the AWS CLI, and an authorized AWS identity. Commands default
to profile `aggregator-admin` and region `eu-central-1`; most AWS commands
also accept `--profile` and `--region`.

## Build and preview a Lambda release

From `tools/publisher/infra/tools`:

```sh
python -B -m unittest discover -s tests -p 'test_*.py'
python src/build_lambda_zip.py --source ../../lambda_publisher/src/lambda_publisher
python src/deploy_lambda_code.py --source ../../lambda_publisher/src/lambda_publisher
```

The builder writes a reproducible ZIP under `build/`, its SHA-256
checksum, and a member manifest. The deploy command **previews only** by
default: it compares the local package hash with the running Lambda.
After reviewing, rerun the deploy command with `--apply`; it checks the
current Lambda revision and requests typed confirmation before changing
code. It does not invoke Lambda or change environment settings.

## Inspect and maintain

```sh
python src/inspect_publication_notifications.py
python src/inspect_watchdog_runtime.py --start-time-utc 2026-01-01T00:00:00Z
python src/set_publication_secrets.py
```

The secret writer needs `boto3` and
`python -m pip install -r requirements.txt`. It collects tokens
through hidden input and asks for confirmation. Inspection commands
summarize alerts or sanitized watchdog logs; they do not drain queue
messages or print credentials.

See [infrastructure](../README.md) for resource ownership and
[Lambda runtime](../../lambda_publisher/README.md) for execution behavior.
