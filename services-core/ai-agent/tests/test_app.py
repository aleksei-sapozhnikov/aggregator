import httpx
import pytest

from product_health_agent.app import create_app


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_ask_returns_503_when_ai_disabled(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_AI_ENABLED", "false")
    monkeypatch.delenv("AGENT_AI_CONFIG", raising=False)

    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/agent/ask",
            json={"question": "What is broken?"},
        )

    assert response.status_code == 503
    assert response.json() == {
        "detail": {
            "code": "service_unavailable",
            "message": "AI agent is disabled. Set AGENT_AI_ENABLED=true.",
        }
    }
