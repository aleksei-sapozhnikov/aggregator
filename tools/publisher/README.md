# Scheduled publication automation

Publishes a finite, prepared queue of GitHub changes and releases according
to a schedule. AWS EventBridge Scheduler invokes the Python Lambda runtime;
DynamoDB tracks queue progress, S3 holds versioned publication inputs, and
the watchdog reconciles scheduled events. This automation is separate from
Aggregator's Product Health runtime.

## Operate

- [Infrastructure](infra/README.md): provision and inspect the AWS resources
  with OpenTofu, using project credentials.
- [Operator tools](infra/tools/README.md): build, preview and explicitly
  deploy a Lambda code update; inspect alarms and watchdog runs; update
  GitHub tokens in Secrets Manager.
- [Lambda runtime](lambda_publisher/README.md): execution contract and tests.

Infrastructure state is at `publication/tofu.tfstate`; changing code is
a separate, explicitly confirmed release step. Queue schedules and
publication inputs are not edited by `tofu apply`.

To validate this module with the repository QA tooling, run from the root:

```sh
python tools/code_qa/src/main.py qa-check --module publisher
```

Do not commit tokens, publication snapshots containing secrets, state, plans,
or downloaded Lambda packages. Check current state and the intended queue
before applying infrastructure or releasing code.
