from dataclasses import dataclass, field
from typing import Any

import pytest
from product_health_agent.agent import (
    CAPABILITY_FALLBACK_RESPONSE,
    SYSTEM_PROMPT,
    ProductHealthAgent,
)
from product_health_agent.model_provider import (
    ModelMessage,
    ModelResponse,
    PresentationMetadata,
    TokenUsage,
    ToolCall,
    ToolDefinition,
)


@dataclass
class FakeTool:
    definition: ToolDefinition
    result: dict[str, Any]
    executed_arguments: list[dict[str, Any]] = field(default_factory=list)

    def execute(self, arguments: dict[str, Any]) -> dict[str, Any]:
        self.executed_arguments.append(arguments.copy())
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


def test_system_prompt_requires_same_language_presentation_metadata() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())

    assert "Presentation metadata MUST be written" in prompt
    assert "same language as the user's original question" in prompt
    assert "This is a strict requirement, not a preference" in prompt
    assert "Do not default presentation metadata to English" in prompt
    assert "Russian question -> Russian presentation labels" in prompt
    assert "English question -> English presentation labels" in prompt
    assert "Serbian question -> Serbian presentation labels" in prompt
    assert "only presentation labels are localized" in prompt


def test_system_prompt_requires_localized_no_tool_capability_response() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())

    assert "For greetings, thanks, capability questions" in prompt
    assert "do not call a Product Health tool" in prompt
    assert "respond in the same language as the user's original question" in prompt
    assert "keep the response very short" in prompt
    assert "what is broken right now" in prompt
    assert "why a product or service is down" in prompt
    assert "current health of a product or service" in prompt
    assert "do not answer unrelated general-knowledge questions" in prompt
    assert "do not invent Product Health facts" in prompt


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


def test_agent_returns_russian_model_response_without_first_tool_call() -> None:
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
                text=(
                    "Я пока не очень умный: могу помочь с тем, что сейчас "
                    "сломано, почему продукт или сервис недоступен, и текущим "
                    "здоровьем продукта или сервиса."
                ),
                tool_calls=[],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Привет")

    assert answer.answer == (
        "Я пока не очень умный: могу помочь с тем, что сейчас сломано, почему "
        "продукт или сервис недоступен, и текущим здоровьем продукта или сервиса."
    )
    assert answer.tool_calls == []
    assert len(model.requests) == 1


def test_agent_returns_short_english_model_response_for_unsupported_question() -> None:
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
                text=(
                    "I'm not very clever yet. I can help with what's broken, "
                    "why something is down, and current product or service health."
                ),
                tool_calls=[],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Who wrote Hamlet?")

    assert answer.answer == (
        "I'm not very clever yet. I can help with what's broken, why something "
        "is down, and current product or service health."
    )
    assert answer.tool_calls == []
    assert len(model.requests) == 1


def test_agent_uses_deterministic_fallback_when_first_model_text_is_blank() -> None:
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
                text="   ",
                tool_calls=[],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Hi")

    assert answer.answer == CAPABILITY_FALLBACK_RESPONSE
    assert answer.tool_calls == []
    assert len(model.requests) == 1


def test_agent_renders_list_unhealthy_items_without_second_model_call() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=_unhealthy_items_result(),
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
        "The following items are currently unhealthy:\n"
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


def test_agent_uses_russian_presentation_metadata_with_deterministic_facts() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={
            "items": [
                {
                    "itemId": "product:fulfillment-hub",
                    "title": "Fulfillment Hub",
                    "state": "DOWN",
                    "signals": [],
                    "affectingDependencies": [
                        {
                            "itemId": "domain:logistics",
                            "title": "Logistics Domain",
                            "state": "DOWN",
                            "depth": 1,
                        }
                    ],
                },
                {
                    "itemId": "domain:logistics",
                    "title": "Logistics Domain",
                    "state": "DOWN",
                    "signals": [
                        {
                            "id": "planning-window",
                            "title": (
                                "Planning cycles complete within the dispatch "
                                "schedule window"
                            ),
                            "source": "demo",
                            "state": "DOWN",
                        }
                    ],
                    "affectingDependencies": [],
                },
            ],
            "count": 2,
        },
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
                        presentation=PresentationMetadata(
                            header=(
                                "Сейчас обнаружены проблемы со следующими "
                                "элементами:"
                            ),
                            signals_label="Проблемные сигналы",
                            dependencies_label="Влияющие зависимости",
                            healthy_message="Сейчас все элементы здоровы.",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Что сейчас сломано?")

    assert answer.answer == (
        "Сейчас обнаружены проблемы со следующими элементами:\n"
        "- Fulfillment Hub (DOWN)\n"
        "  Влияющие зависимости: Logistics Domain (DOWN)\n"
        "- Logistics Domain (DOWN)\n"
        "  Проблемные сигналы: Planning cycles complete within the dispatch "
        "schedule window (DOWN)"
    )
    assert tool.executed_arguments == [{}]
    assert len(model.requests) == 1


def test_agent_uses_english_presentation_metadata() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=_unhealthy_items_result(),
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
                        presentation=PresentationMetadata(
                            header="Current problems affect these items:",
                            signals_label="Problem signals",
                            dependencies_label="Impacting dependencies",
                            healthy_message="All items are currently healthy.",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert answer.answer.startswith("Current problems affect these items:")
    assert "Problem signals: HTTP health (DOWN)" in answer.answer
    assert "Impacting dependencies: Commerce Core (DOWN)" in answer.answer


def test_agent_falls_back_when_presentation_metadata_is_missing() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=_unhealthy_items_result(),
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(id="tool-1", name="list_unhealthy_items", arguments={})
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert answer.answer.startswith("The following items are currently unhealthy:")
    assert "Unhealthy signals: HTTP health (DOWN)" in answer.answer


def test_agent_falls_back_when_presentation_metadata_is_blank() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=_unhealthy_items_result(),
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
                        presentation=PresentationMetadata(
                            header="",
                            signals_label="   ",
                            dependencies_label="Dependencies",
                            healthy_message="Healthy",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert answer.answer.startswith("The following items are currently unhealthy:")
    assert "Unhealthy signals: HTTP health (DOWN)" in answer.answer
    assert "Dependencies:" not in answer.answer


def test_agent_does_not_take_factual_values_from_presentation_metadata() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=_unhealthy_items_result(),
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
                        presentation=PresentationMetadata(
                            header="999 items are unhealthy because Payments is DOWN:",
                            signals_label="HTTP health",
                            dependencies_label="Commerce Core",
                            healthy_message="Checkout is healthy.",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")

    assert "999" not in answer.answer
    assert "Payments" not in answer.answer
    assert answer.answer.startswith("The following items are currently unhealthy:")
    assert "Unhealthy signals: HTTP health (DOWN)" in answer.answer
    assert "Affecting dependencies: Commerce Core (DOWN)" in answer.answer


def test_catalog_product_and_signal_names_remain_unchanged() -> None:
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result={
            "items": [
                {
                    "itemId": "product:returns",
                    "title": "Returns Portal",
                    "state": "DOWN",
                    "signals": [
                        {
                            "id": "signal:refund-window",
                            "title": "Refund window SLA",
                            "state": "DOWN",
                        }
                    ],
                    "affectingDependencies": [
                        {
                            "itemId": "service:ledger",
                            "title": "Ledger Service",
                            "state": "UNKNOWN",
                        }
                    ],
                }
            ],
            "count": 1,
        },
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
                        presentation=PresentationMetadata(
                            header=(
                                "Сейчас обнаружены проблемы со следующими "
                                "элементами:"
                            ),
                            signals_label="Проблемные сигналы",
                            dependencies_label="Влияющие зависимости",
                            healthy_message="Сейчас все элементы здоровы.",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Что сейчас сломано?")

    assert "- Returns Portal (DOWN)" in answer.answer
    assert "Проблемные сигналы: Refund window SLA (DOWN)" in answer.answer
    assert "Влияющие зависимости: Ledger Service (UNKNOWN)" in answer.answer


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


def _unhealthy_items_result() -> dict[str, Any]:
    return {
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
    }
