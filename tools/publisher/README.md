# Publication automation

This directory groups AWS infrastructure, operator tools, and the Lambda runtime
for scheduled GitHub publication.

- [infra/](infra/README.md): OpenTofu infrastructure and state configuration.
- [infra/tools/](infra/tools/README.md): packaging, deployment, inspection, and
  secret management tools.
- [lambda_publisher/](lambda_publisher/README.md): Lambda runtime and tests.

These components are checked together as the `publisher` QA module:

```sh
python tools/code_qa/src/main.py code-qa --module publisher
```

The remote state key remains `publication/tofu.tfstate`. Moving the local
directory does not change AWS resource addresses or the configured backend key.
