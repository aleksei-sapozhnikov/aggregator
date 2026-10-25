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

The base Compose stack leaves AI disabled unless explicitly configured. Local
Compose environments (`local` and `local-demo`) enable Bedrock automatically
and keep the non-secret model settings in
`compose/compose.overlay.local-ports.yaml`.

Authentication still requires temporary AWS credentials. The
`aggregator-admin` IAM user gets restricted Nova Lite invocation permissions
through the `AggregatorBedrockDevelopers` group, so no long-lived Bedrock API
key or IAM access key is needed.

From PowerShell in the repository root:

```powershell
aws login --profile aggregator-admin
aws sts get-caller-identity --profile aggregator-admin

# Export temporary AWS credentials for the local AI agent container.
Invoke-Expression ((aws configure export-credentials --profile aggregator-admin --format powershell) -join "`n")

make up
```

With no overrides, local Compose uses the included Bedrock model settings.
To change the model or region, set `AGENT_AI_CONFIG` in the same shell
before running `make up`. For example, PowerShell:

```powershell
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
```

Use your own AWS profile in the login and credential-export commands above
instead of `aggregator-admin`. Your AWS identity must have permission to invoke
the selected Bedrock model in the selected region. You do not need the project's
IAM users or groups. The current AI agent supports the Bedrock provider only.

Set `AGENT_AI_ENABLED=false` in the shell to disable local AI without
modifying Compose files. Only `ai-agent` receives the temporary credentials.
The project-root `.env` file is tracked by Git: do not put credentials there.
Keep personal setup scripts in the ignored `.private/` directory.
Docker stores them in the container configuration while it runs; do not share
`docker inspect` output or run untrusted code inside that container.

The AWS session expires. After refreshing the login and exporting new
credentials, recreate the agent so it receives the new session:

```powershell
aws login --profile aggregator-admin
Invoke-Expression ((aws configure export-credentials --profile aggregator-admin --format powershell) -join "`n")
make recreate-svc ai-agent
```

When finished, stop the stack with `make down` and clear
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN`
from the current PowerShell session.

For deployment on EC2, the Bedrock provider uses the instance IAM role
when `api_key` and explicit AWS credentials are omitted from
`AGENT_AI_CONFIG`.
