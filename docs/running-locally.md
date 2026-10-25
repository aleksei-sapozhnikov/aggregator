# Running Locally

This repository is designed to run through Docker Compose. The default local
environment is `local-demo`: core services, demo services, Prometheus, Grafana,
and chaos-maker.

## Prerequisites

- Docker or Podman with Compose support.
- Optional: `make`. On Windows it can be installed through tools such as
  [GnuWin](https://sourceforge.net/projects/gnuwin32/).

The first startup can take a while because images are downloaded and local
service images are built.

## Recommended path

From the repository root:

```shell
make up
```

Open the UI:

```text
http://localhost:3000
```

Stop the stack:

```shell
make down
```

Show available targets:

```shell
make help
```

## Compose environments

`Makefile` supports three environments:

- `local-demo` (default): full local demo with dummy services and chaos-maker.
- `local`: core stack without demo service overlay.
- `demo`: hosted demo stack with public Caddy configuration.

Examples:

```shell
make up ENV=local
make rebuild-recreate ENV=local-demo
make down ENV=demo
```

## Local ports

The default local demo exposes:

- UI: `http://localhost:3000`
- Aggregator API and actuator endpoints: `http://localhost:8080`
- Aggregator debug port: `localhost:5005`
- AI agent API: `http://localhost:8085`
- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Catalog API: `http://localhost:8084`
- Dummy Java service: `http://localhost:8081`
- Dummy Python service: `http://localhost:8082`
- Dummy JavaScript service: `http://localhost:8083`

## Manual Compose commands

Examples below use Docker. If you use Podman, replace `docker compose` with
`podman compose`.

To start the default local demo, run this command from the repository root:

```shell
docker compose --project-name aggregator-local-demo --project-directory . -f compose/compose.yaml -f compose/compose.local-demo.yaml -f compose/compose.overlay.demo-services.yaml -f compose/compose.overlay.local-ports.yaml -f compose/compose.overlay.demo-services-local-ports.yaml up --detach --wait --remove-orphans
```

To stop it, run this command from the repository root:

```shell
docker compose --project-name aggregator-local-demo --project-directory . -f compose/compose.yaml -f compose/compose.local-demo.yaml -f compose/compose.overlay.demo-services.yaml -f compose/compose.overlay.local-ports.yaml -f compose/compose.overlay.demo-services-local-ports.yaml down --remove-orphans
```

The compose files live under `compose/`. Keep `--project-directory .` in manual
commands so relative paths and the root `.env` file resolve from the repository
root. The `Makefile` is the source of truth for supported compose combinations
and service-scoped commands.

## Optional AI agent

The Python AI agent container starts with AI disabled by default. The rest of the
Product Health stack works normally in that mode. To enable the Bedrock
provider, set `AGENT_AI_ENABLED=true` and provide one of the supported
authentication configurations before starting Compose.

For local Docker Compose, prefer temporary AWS credentials from the existing
`aggregator-admin` profile. The user receives narrowly scoped model-invocation
permission through the `AggregatorBedrockDevelopers` IAM group. No long-lived
Bedrock API key or IAM access key needs to be stored.

Run these commands in PowerShell from the repository root:

```powershell
aws login --profile aggregator-admin
aws sts get-caller-identity --profile aggregator-admin

# Export temporary session credentials for the local AI agent container.
Invoke-Expression ((aws configure export-credentials --profile aggregator-admin --format powershell) -join "`n")

$agentConfig = @{
    provider = "bedrock"
    max_tool_rounds = 2
    bedrock = @{
        model_id = "eu.amazon.nova-lite-v1:0"
        aws_region = "eu-central-1"
        temperature = 0.00001
        max_tokens = 300
    }
}

$env:AGENT_AI_CONFIG = $agentConfig | ConvertTo-Json -Compress -Depth 5
$env:AGENT_AI_ENABLED = "true"

make up
```

The local Compose overlay passes these temporary credentials only to the
`ai-agent` container. Docker stores them in the container configuration while
it runs, so do not share `docker inspect` output or run untrusted code inside
that container. The session expires; after refreshing credentials with
`aws login`, repeat the export and recreate the agent:

```powershell
make recreate-svc ai-agent
```

When finished, stop the stack with `make down` and remove the temporary
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`
environment variables from the PowerShell session.

Alternatively, a Bedrock bearer API key is supported by setting
`bedrock.api_key` in `AGENT_AI_CONFIG`, but long-term keys are discouraged.
Do not commit any credentials.

For deployment on EC2, omit `api_key` and the explicit AWS credential fields.
boto3 then uses the normal default credential chain, including the instance IAM
role.
