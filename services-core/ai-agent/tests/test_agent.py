from dataclasses import dataclass
from typing import Any

import pytest
from product_health_agent.agent import ProductHealthAgent
from product_health_agent.model_provider import (
    ModelMessage,
    ModelResponse,
    TokenUsage,
    ToolCall,
    ToolDefinition,
)


@dataclass(frozen=True)
class FakeTool:
    definition: ToolDefinition
    result: dict[str, Any]

    def execute(self, arguments: dict[str, Any]) -> dict[str, Any]:
        return self.result


class FakeModelProvider:
    def __init__(self, responses: list[ModelResponse]) -> None:
        self.responses = responses
        self.requests: list[list[ModelMessage]] = []

    def is_available(self) -> bool:
        return True

    def complete(
        self,
        *,
        system_prompt: str,
        messages: list[ModelMessage],
        tools: list[ToolDefinition],
    ) -> ModelResponse:
        self.requests.append(list(messages))
        return self.responses.pop(0)


def test_agent_executes_tool_before_answering() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="get_product_health",
            description="Get product health.",
            input_schema={"type": "object"},
        ),
        result={
            "found": True,
            "item": {
                "itemId": "product:checkout",
                "title": "Checkout",
                "state": "DOWN",
            },
        },
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="get_product_health",
                        arguments={"query": "Checkout"},
                    )
                ],
                usage=TokenUsage(input_tokens=10, output_tokens=3, total_tokens=13),
            ),
            ModelResponse(
                text="Checkout is down because Payments is down.",
                tool_calls=[],
                usage=TokenUsage(input_tokens=20, output_tokens=8, total_tokens=28),
            ),
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Why is Checkout down?")

    assert answer.answer == "Checkout is down because Payments is down."
    assert answer.tool_calls == ["get_product_health"]
    assert answer.usage.total_tokens == 41
    assert model.requests[1][-1].tool_results[0].result["found"] is True


def test_agent_returns_capability_message_without_first_tool_call() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={},
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="Checkout is down.",
                tool_calls=[],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Hi")

    assert "Checkout is down." not in answer.answer
    assert "What is broken right now?" in answer.answer
    assert answer.tool_calls == []
    assert len(model.requests) == 1


def test_agent_renders_list_unhealthy_items_without_second_model_call() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={
            "items": [
                {
                    "itemId": "product:commerce-core",
                    "title": "Commerce Core",
                    "state": "DOWN",
                    "signals": [
                        {
                            "id": "http",
                            "title": "HTTP health",
                            "source": "demo",
                            "state": "DOWN",
                        },
                        {
                            "id": "cache",
                            "title": "Cache health",
                            "source": "demo",
                            "state": "UP",
                        },
                    ],
                    "affectingDependencies": [],
                },
                {
                    "itemId": "product:commerce-platform",
                    "title": "Commerce Platform",
                    "state": "DOWN",
                    "signals": [],
                    "affectingDependencies": [
                        {
                            "itemId": "product:commerce-core",
                            "title": "Commerce Core",
                            "state": "DOWN",
                            "depth": 1,
                        }
                    ],
                },
            ],
            "count": 2,
        },
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="Payments caused this outage.",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="list_unhealthy_items",
                        arguments={},
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert answer.answer == (
        "2 items are currently unhealthy:\n"
        "- Commerce Core (DOWN)\n"
        "  Unhealthy signals: HTTP health (DOWN)\n"
        "- Commerce Platform (DOWN)\n"
        "  Affecting dependencies: Commerce Core (DOWN)"
    )
    assert answer.tool_calls == ["list_unhealthy_items"]
    assert len(model.requests) == 1
    assert "Cache health" not in answer.answer
    assert "Payments" not in answer.answer
    assert "because" not in answer.answer


def test_agent_renders_zero_unhealthy_items() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={"items": [], "count": 0},
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="list_unhealthy_items",
                        arguments={},
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert answer.answer == "No items are currently unhealthy."
    assert answer.tool_calls == ["list_unhealthy_items"]
    assert len(model.requests) == 1


def test_agent_rejects_unknown_tool() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={},
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="",
                tool_calls=[ToolCall(id="tool-1", name="unknown_tool", arguments={})],
            )
        ]
    )

    with pytest.raises(ValueError, match="Unsupported tool"):
        ProductHealthAgent(model, [tool]).answer("What is broken?")
