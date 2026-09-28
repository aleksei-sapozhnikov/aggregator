from product_health_agent.config import load_config


def test_loads_provider_json_config(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_AI_ENABLED", "true")
    monkeypatch.setenv(
        "AGENT_AI_CONFIG",
        '{"provider":"bedrock","max_tool_rounds":3,'
        '"bedrock":{"model_id":"model","aws_region":"eu-central-1"}}',
    )

    config = load_config()

    assert config.enabled is True
    assert config.max_tool_rounds == 3
    assert config.ai_config["provider"] == "bedrock"
    assert config.ai_config["bedrock"]["model_id"] == "model"
