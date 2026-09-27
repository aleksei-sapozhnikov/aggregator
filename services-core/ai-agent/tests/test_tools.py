import logging

import pytest
import requests
from product_health_agent.tools import RestProductHealthTools


def test_product_health_tool_reports_api_unavailable(monkeypatch, caplog) -> None:
    def raise_timeout(*args, **kwargs):
        raise requests.Timeout("timed out")

    monkeypatch.setattr(requests, "get", raise_timeout)
    tool = RestProductHealthTools("http://product-health").tools()[0]

    with caplog.at_level(logging.ERROR), pytest.raises(
        RuntimeError, match="Product Health API is unavailable"
    ) as error:
        tool.execute({"query": "Checkout"})

    assert isinstance(error.value.__cause__, requests.Timeout)
    assert "Product Health API request failed" in caplog.text
    assert "operation=get_product_health" in caplog.text
    assert "base_url=http://product-health" in caplog.text
    assert "endpoint=/api/product-health/search" in caplog.text
    assert "Traceback" in caplog.text


def test_list_unhealthy_items_tool_schema_requires_presentation_metadata() -> None:
    tools = {
        tool.definition.name: tool.definition
        for tool in RestProductHealthTools("http://product-health").tools()
    }

    schema = tools["list_unhealthy_items"].input_schema

    assert schema["required"] == ["presentation"]
    presentation = schema["properties"]["presentation"]
    assert presentation["type"] == "object"
    assert presentation["required"] == [
        "header",
        "signals_label",
        "dependencies_label",
        "healthy_message",
    ]
    assert presentation["properties"]["header"] == {"type": "string"}
    assert presentation["properties"]["signals_label"] == {"type": "string"}
    assert presentation["properties"]["dependencies_label"] == {"type": "string"}
    assert presentation["properties"]["healthy_message"] == {"type": "string"}
