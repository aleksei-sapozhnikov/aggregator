# Product Health AI agent

Optional Python/FastAPI service that translates natural-language questions
into queries against the aggregator's **deterministic** Product Health API.
The model can select tools and generate short explanations, but cannot change
or calculate Item health. Structured health facts are returned separately for
the UI to render.

## Use it

The HTTP service exposes `GET /health` and `POST /api/agent/ask`:

```sh
curl -X POST http://localhost:8085/api/agent/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is unhealthy right now?"}'
```

Start the integrated environment with `make up` at the repository root.
The base Compose configuration disables AI; local Compose overlays enable
it with a Bedrock model, but answering requires valid AWS credentials and
permission to invoke that model. See [local AI setup](../../docs/running-locally.md#optional-ai-agent)
for temporary credentials and refresh steps.

## Configuration

- `AGENT_AI_ENABLED=true` enables model calls; false returns a service
  unavailable error for questions.
- `PRODUCT_HEALTH_BASE_URL` selects the aggregator (default
  `http://aggregator:8080` inside Compose).
- `AGENT_AI_CONFIG` is JSON for the model provider, tool round limit, and
  provider settings. Only AWS Bedrock is currently implemented.

Example non-secret configuration:

```json
{
  "provider": "bedrock",
  "max_tool_rounds": 2,
  "bedrock": {
    "model_id": "eu.amazon.nova-lite-v1:0",
    "aws_region": "eu-central-1",
    "temperature": 0.00001,
    "max_tokens": 300
  }
}
```

Use the standard boto3 credential chain or temporary AWS credentials outside
Git; on EC2 use the instance role. Do not commit API keys or session tokens.

## Develop

With Python 3.12 and dependencies installed from `src/requirements.txt`,
run `uvicorn product_health_agent.app:app --host 0.0.0.0 --port 8080`
with `services/ai-agent/src` on `PYTHONPATH`. Set the aggregator base URL
to a reachable endpoint first. Tests live under `tests/product_health_agent/`
and mock the model and Product Health API; run them with pytest from this
module after installing the test dependencies.

The scope is deliberately limited to health questions about catalog Items
and their dependencies. It is not a general-purpose assistant.
