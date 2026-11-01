# Publication Lambda runtime

Processes scheduled GitHub publication steps and watchdog reconciliation.
This component has no dependency on the local operator tools.

- `src/lambda_publisher/`: entrypoint, GitHub helpers, queue processing, and state.
- `tests/`: credential selection and secret-read failure tests without AWS calls.

Run from this directory with Python 3.10 or newer:

```sh
python -B -m unittest discover -s tests -p 'test_*.py'
```

The deployed runtime is Python 3.12 and supplies `boto3`. The ZIP builder takes
`src/lambda_publisher/` as its `--source` input and packages it as
`github_publication_runner`, preserving the configured handler
`github_publication_runner.handler.lambda_handler`.

The runtime source lives under `tools/lambda_publisher/` in the repository.
The infrastructure and operator tools remain in
[`deploy/infra/publication`](../../deploy/infra/publication/README.md).
