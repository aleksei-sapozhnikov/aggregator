"""Runtime configuration for the Product Health AI agent.

AI-provider-specific settings live in the AGENT_AI_CONFIG JSON string so Compose
does not need provider-specific environment variables. Supported shape today:

{
  "provider": "bedrock",
  "max_tool_rounds": 2,
  "bedrock": {
    "model_id": "eu.amazon.nova-lite-v1:0",
    "aws_region": "eu-central-1",
    "api_key": "local-bedrock-api-key",
    "temperature": 0.00001,
    "max_tokens": 300
  }
}

For optional explicit AWS credentials, use:

{
  "provider": "bedrock",
  "max_tool_rounds": 2,
  "bedrock": {
    "model_id": "eu.amazon.nova-lite-v1:0",
    "aws_region": "eu-central-1",
    "aws_access_key_id": "local-access-key",
    "aws_secret_access_key": "local-secret-key",
    "aws_session_token": "local-session-token"
  }
}

Only provider and bedrock.model_id are required when AGENT_AI_ENABLED=true.
The api_key, AWS credential fields, temperature, and max_tokens are optional.
When credentials are omitted, boto3 uses the normal AWS credential chain.
"""

import json
import os
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentConfig:
    enabled: bool
    product_health_base_url: str
    ai_config: dict[str, Any]
    max_tool_rounds: int


def load_config() -> AgentConfig:
    """Load configuration from environment variables."""
    ai_config = _load_ai_config(os.getenv("AGENT_AI_CONFIG", ""))
    return AgentConfig(
        enabled=os.getenv("AGENT_AI_ENABLED", "false").strip().lower() == "true",
        product_health_base_url=os.getenv(
            "PRODUCT_HEALTH_BASE_URL",
            "http://aggregator:8080",
        ).rstrip("/"),
        ai_config=ai_config,
        max_tool_rounds=max(1, int(ai_config.get("max_tool_rounds", 2))),
    )


def _load_ai_config(raw_config: str) -> dict[str, Any]:
    if not raw_config.strip():
        return {}
    payload = json.loads(raw_config)
    if not isinstance(payload, dict):
        raise TypeError("AGENT_AI_CONFIG must be a JSON object.")
    return payload
