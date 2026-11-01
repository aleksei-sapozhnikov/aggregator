# Publication tools

Local operator commands, usable independently of the runtime source tree.
Use Python 3.10 or newer; inspection and release commands also need the AWS CLI.
AWS commands accept `--profile` and `--region`; defaults are
`aggregator-admin` and `eu-central-1`.

- `src/`: command scripts and their shared AWS CLI adapter.
- `tests/`: `test_<script>.py` files matching the tested scripts in `src/`;
  `lambda_fixtures.py` supplies shared runtime fixtures without AWS calls.
- `requirements.txt`: AWS SDK dependency for the secret writer.

| File                                   | Purpose                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| `build_lambda_zip.py`                  | Build a reproducible ZIP, checksum, and manifest locally.            |
| `compare_lambda_zip.py`                | Compare ZIP member names and hashes without printing contents.       |
| `deploy_lambda_code.py`                | Build and preview a code release; `--apply` confirms and deploys it. |
| `inspect_publication_notifications.py` | Read alert, subscription, alarm, and DLQ metadata.                   |
| `inspect_watchdog_runtime.py`          | Summarize sanitized watchdog logs from a UTC timestamp.              |
| `set_publication_secrets.py`           | Write GitHub tokens using hidden input and `WRITE` confirmation.     |
| `aws_cli.py`                           | Shared AWS CLI adapter that redacts error responses.                 |

Run from this directory:

```sh
python -m pip install -r requirements.txt
python -B -m unittest discover -s tests -p 'test_*.py'
python src/build_lambda_zip.py --source ../../lambda_publisher/src/lambda_publisher
python src/compare_lambda_zip.py /private/live.zip build/publication-lambda.zip
python src/deploy_lambda_code.py --source ../../lambda_publisher/src/lambda_publisher
python src/inspect_publication_notifications.py
python src/inspect_watchdog_runtime.py --start-time-utc 2026-01-01T00:00:00Z
python src/set_publication_secrets.py
```

The table lists files under `src/`. Build and release commands require `--source`
pointing to the package directory containing `handler.py`. Their `--output`
defaults to `build/publication-lambda.zip` relative to the working directory.
Inspection commands do not invoke Lambda, read queue messages, or print
credentials and email endpoints.
