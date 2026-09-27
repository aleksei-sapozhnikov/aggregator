"""HTTP API for the optional Product Health AI agent."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .agent import ProductHealthAgent
from .bedrock_provider import BedrockModelProvider
from .config import load_config
from .model_provider import UnavailableModelProvider
from .tools import RestProductHealthTools


class AgentQuestion(BaseModel):
    question: str


def error_detail(code: str, message: str) -> dict[str, str]:
    return {"code": code, "message": message}


def create_app() -> FastAPI:
    config = load_config()
    provider = str(config.ai_config.get("provider", "bedrock")).strip().lower()
    if config.enabled and provider == "bedrock":
        model_provider = BedrockModelProvider.from_config(config.ai_config)
    elif config.enabled and provider != "bedrock":
        model_provider = UnavailableModelProvider(
            f"Unsupported model provider: {provider}"
        )
    else:
        model_provider = UnavailableModelProvider(
            "AI agent is disabled. Set AGENT_AI_ENABLED=true."
        )

    tool_provider = RestProductHealthTools(config.product_health_base_url)
    agent = ProductHealthAgent(
        model_provider=model_provider,
        tools=tool_provider.tools(),
        max_tool_rounds=config.max_tool_rounds,
    )

    app = FastAPI(title="Product Health AI Agent")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "UP"}

    @app.post("/api/agent/ask")
    def ask(request: AgentQuestion) -> dict:
        try:
            return asdict(agent.answer(request.question))
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=error_detail("bad_request", str(exc)),
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503,
                detail=error_detail("service_unavailable", str(exc)),
            ) from exc

    return app


app = create_app()
