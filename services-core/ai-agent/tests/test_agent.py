from dataclasses import dataclass, field
from typing import Any

import pytest
from product_health_agent.agent import (
    CAPABILITY_FALLBACK_RESPONSE,
    RESPOND_WITH_CAPABILITIES_TOOL_NAME,
    SYSTEM_PROMPT,
    ProductHealthAgent,
)
from product_health_agent.model_provider import (
    ModelMessage,
    ModelProvider,
    ModelResponse,
    PresentationMetadata,
    TokenUsage,
    ToolCall,
    ToolChoice,
    ToolDefinition,
)
from product_health_agent.tools import RestProductHealthTools


@dataclass
class FakeTool:
    definition: ToolDefinition
    result: dict[str, Any]
    executed_arguments: list[dict[str, Any]] = field(default_factory=list)

    def execute(self, arguments: dict[str, Any]) -> dict[str, Any]:
        self.executed_arguments.append(arguments.copy())
        return self.result


class FakeModelProvider(ModelProvider):
    def __init__(self, responses: list[ModelResponse]) -> None:
        self.responses = responses
        self.requests: list[list[ModelMessage]] = []
        self.system_prompts: list[str] = []
        self.tool_requests: list[list[ToolDefinition]] = []
        self.tool_choices: list[ToolChoice] = []

    def is_available(self) -> bool:
        return True

    def complete(
        self,
        *,
        system_prompt: str,
        messages: list[ModelMessage],
        tools: list[ToolDefinition],
        tool_choice: ToolChoice = ToolChoice.AUTO,
    ) -> ModelResponse:
        self.system_prompts.append(system_prompt)
        self.requests.append(list(messages))
        self.tool_requests.append(list(tools))
        self.tool_choices.append(tool_choice)
        return self.responses.pop(0)


def test_system_prompt_uses_agent_selected_response_language() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())

    assert "Presentation metadata MUST use the RESPONSE LANGUAGE" in prompt
    assert "same language as the user's original question" not in prompt
    assert "Russian question -> Russian presentation labels" not in prompt
    assert "English question -> English presentation labels" not in prompt
    assert "Serbian question -> Serbian presentation labels" not in prompt
    assert "only presentation labels are localized" in prompt


def test_system_prompt_requires_localized_no_tool_capability_response() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())

    assert (
        "For greetings, thanks, capability questions, or unsupported/unrelated "
        "requests" in prompt
    )
    assert "call respond_with_capabilities" in prompt
    assert "do not call a Product Health tool" in prompt
    assert "use one short sentence when possible" in prompt
    assert "currently only support Product Health questions" in prompt
    assert "what is broken" in prompt
    assert "why something is down" in prompt
    assert "current product/service health" in prompt
    assert "do not answer the unrelated question itself" in prompt
    assert "do not invent Product Health facts" in prompt


def test_agent_exposes_local_capability_action_to_model() -> None:
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
                tool_calls=[],
            )
        ]
    )

    ProductHealthAgent(model, [tool]).answer("Hi")

    assert model.tool_choices == [ToolChoice.REQUIRED]
    capability_tool = {
        definition.name: definition for definition in model.tool_requests[0]
    }[RESPOND_WITH_CAPABILITIES_TOOL_NAME]
    message_schema = capability_tool.input_schema["properties"]["message"]
    assert capability_tool.input_schema["required"] == ["message"]
    assert message_schema["type"] == "string"
    assert message_schema["maxLength"] == 300
    assert "RESPONSE LANGUAGE specified by the agent" in message_schema["description"]
    assert (
        "must not answer the unrelated question itself" in message_schema["description"]
    )
    assert "XML/HTML-style tags" in message_schema["description"]


def test_list_unhealthy_items_presentation_schema_uses_response_language() -> None:
    tools = RestProductHealthTools("http://product-health.example").tools()
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="",
                tool_calls=[],
            )
        ]
    )

    ProductHealthAgent(model, tools).answer("What is broken now?")

    unhealthy_tool = {
        definition.name: definition for definition in model.tool_requests[0]
    }["list_unhealthy_items"]
    presentation_schema = unhealthy_tool.input_schema["properties"]["presentation"]
    assert (
        "RESPONSE LANGUAGE specified by the agent" in presentation_schema["description"]
    )
    assert (
        "same language as the user's original question"
        not in presentation_schema["description"]
    )
    assert (
        "RESPONSE LANGUAGE"
        in presentation_schema["properties"]["header"]["description"]
    )


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
    assert model.tool_choices == [ToolChoice.REQUIRED, ToolChoice.AUTO]
    assert model.requests[1][-1].tool_results[0].result["found"] is True
    assert model.system_prompts[0] == model.system_prompts[1]
    assert "RESPONSE LANGUAGE: English (en)" in model.system_prompts[0]
    assert tool.executed_arguments == [{"query": "Checkout"}]


def test_agent_returns_russian_structured_capability_message() -> None:
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
                text="<thinking>unsupported</thinking>",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name=RESPOND_WITH_CAPABILITIES_TOOL_NAME,
                        arguments={
                            "message": (
                                "Я пока отвечаю только про Product Health: что "
                                "сломано, почему что-то недоступно, и текущее "
                                "здоровье продукта или сервиса."
                            )
                        },
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Привет")

    assert answer.answer == (
        "Я пока отвечаю только про Product Health: что сломано, почему что-то "
        "недоступно, и текущее здоровье продукта или сервиса."
    )
    assert answer.tool_calls == [RESPOND_WITH_CAPABILITIES_TOOL_NAME]
    assert tool.executed_arguments == []
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]
    assert "RESPONSE LANGUAGE: Russian (ru)" in model.system_prompts[0]


def test_agent_returns_short_english_structured_capability_message() -> None:
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
                text="I should not be returned.",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name=RESPOND_WITH_CAPABILITIES_TOOL_NAME,
                        arguments={
                            "message": (
                                "I only support Product Health questions: what's "
                                "broken, why something is down, and current "
                                "product or service health."
                            )
                        },
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Who wrote Hamlet?")

    assert answer.answer == (
        "I only support Product Health questions: what's broken, why something "
        "is down, and current product or service health."
    )
    assert answer.tool_calls == [RESPOND_WITH_CAPABILITIES_TOOL_NAME]
    assert tool.executed_arguments == []
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]


def test_agent_never_returns_raw_text_when_first_model_response_has_no_tool_call() -> (
    None
):
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
                    "<thinking>I know the answer.</thinking>\n"
                    "Я пока отвечаю только про Product Health."
                ),
                tool_calls=[],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Hi")

    assert answer.answer == CAPABILITY_FALLBACK_RESPONSE
    assert answer.tool_calls == []
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]


@pytest.mark.parametrize(
    "arguments",
    [
        {},
        {"message": ""},
        {"message": "   "},
        {"message": 42},
        {"message": "<thinking>internal</thinking> I only support Product Health."},
        {"message": "<analysis>internal</analysis> I only support Product Health."},
        {"message": "<reasoning>internal</reasoning> I only support Product Health."},
    ],
)
def test_agent_uses_deterministic_fallback_for_invalid_capability_message(
    arguments: dict[str, Any],
) -> None:
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
                text="<thinking>raw text must not leak</thinking>",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name=RESPOND_WITH_CAPABILITIES_TOOL_NAME,
                        arguments=arguments,
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Сколько лет Сталину?")

    assert answer.answer == CAPABILITY_FALLBACK_RESPONSE
    assert "<thinking>" not in answer.answer
    assert "<analysis>" not in answer.answer
    assert "<reasoning>" not in answer.answer
    assert answer.tool_calls == [RESPOND_WITH_CAPABILITIES_TOOL_NAME]
    assert tool.executed_arguments == []
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]


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
        "- Commerce Platform (DOWN)\n"
        "  Affecting dependencies:\n"
        "  - Commerce Core (DOWN)\n"
        "    Unhealthy signals:\n"
        "    - HTTP health (DOWN)"
    )
    assert answer.structured_content == {
        "type": "unhealthy_items",
        "presentation": {
            "header": "The following items are currently unhealthy:",
            "signals_label": "Unhealthy signals",
            "dependencies_label": "Affecting dependencies",
            "healthy_message": "No items are currently unhealthy.",
        },
        "items": [
            {
                "item_id": "product:commerce-platform",
                "title": "Commerce Platform",
                "state": "DOWN",
                "signals": [],
                "affecting_dependencies": [
                    {
                        "item_id": "product:commerce-core",
                        "title": "Commerce Core",
                        "state": "DOWN",
                        "signals": [
                            {
                                "id": "http",
                                "title": "HTTP health",
                                "state": "DOWN",
                            }
                        ],
                    }
                ],
            }
        ],
    }
    assert answer.tool_calls == ["list_unhealthy_items"]
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]
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
                                "Сейчас обнаружены проблемы со следующими элементами:"
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
        "  Влияющие зависимости:\n"
        "  - Logistics Domain (DOWN)\n"
        "    Проблемные сигналы:\n"
        "    - Planning cycles complete within the dispatch schedule window (DOWN)"
    )
    assert answer.structured_content["presentation"] == {
        "header": "Сейчас обнаружены проблемы со следующими элементами:",
        "signals_label": "Проблемные сигналы",
        "dependencies_label": "Влияющие зависимости",
        "healthy_message": "Сейчас все элементы здоровы.",
    }
    assert tool.executed_arguments == [{}]
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]


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
    assert "Impacting dependencies:" in answer.answer
    assert "- Commerce Core (DOWN)" in answer.answer
    assert answer.structured_content["presentation"]["signals_label"] == (
        "Problem signals"
    )


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
    assert "Affecting dependencies:" in answer.answer
    assert "- Commerce Core (DOWN)" in answer.answer


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
    assert "Affecting dependencies:" in answer.answer
    assert "- Commerce Core (DOWN)" in answer.answer
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
    assert "Affecting dependencies:" in answer.answer
    assert "- Commerce Core (DOWN)" in answer.answer


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
                                "Сейчас обнаружены проблемы со следующими элементами:"
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
    assert "Влияющие зависимости:" in answer.answer
    assert "- Ledger Service (UNKNOWN)" in answer.answer


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
    assert answer.structured_content == {
        "type": "unhealthy_items",
        "presentation": {
            "header": "The following items are currently unhealthy:",
            "signals_label": "Unhealthy signals",
            "dependencies_label": "Affecting dependencies",
            "healthy_message": "No items are currently unhealthy.",
        },
        "items": [],
    }
    assert answer.tool_calls == ["list_unhealthy_items"]
    assert len(model.requests) == 1


def test_list_unhealthy_item_referenced_as_dependency_is_not_top_level() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    assert [item["item_id"] for item in answer.structured_content["items"]] == [
        "product:customer-experience"
    ]
    assert "Experience Foundation (DOWN)" in answer.answer


def test_list_unhealthy_items_removes_several_dependency_items_from_top_level() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    item = answer.structured_content["items"][0]
    assert item["title"] == "Customer Experience"
    assert [
        dependency["item_id"]
        for dependency in item["affecting_dependencies"]
    ] == [
        "product:experience-foundation",
        "product:experience-line",
        "product:engagement-suite",
    ]
    assert answer.answer.count("Experience Line (UNKNOWN)") == 1
    assert answer.answer.count("Engagement Suite (DOWN)") == 1


def test_list_unhealthy_items_deduplicates_repeated_dependency_ids() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    dependencies = answer.structured_content["items"][0]["affecting_dependencies"]
    assert [
        dependency["item_id"] for dependency in dependencies
    ] == [
        "product:experience-foundation",
        "product:experience-line",
        "product:engagement-suite",
    ]
    assert answer.answer.count("Experience Foundation (DOWN)") == 1
    assert answer.answer.count("SLI: Foundation availability (DOWN)") == 1


def test_list_unhealthy_items_all_referenced_cycle_falls_back_to_original_list() -> None:
    answer = _answer_list_unhealthy_items(
        {
            "items": [
                {
                    "itemId": "product:a",
                    "title": "Product A",
                    "state": "DOWN",
                    "signals": [],
                    "affectingDependencies": [
                        {"itemId": "product:b", "title": "Product B", "state": "DOWN"}
                    ],
                },
                {
                    "itemId": "product:b",
                    "title": "Product B",
                    "state": "DOWN",
                    "signals": [],
                    "affectingDependencies": [
                        {"itemId": "product:a", "title": "Product A", "state": "DOWN"}
                    ],
                },
            ],
            "count": 2,
        }
    )

    assert [item["item_id"] for item in answer.structured_content["items"]] == [
        "product:a",
        "product:b",
    ]
    assert "- Product A (DOWN)" in answer.answer
    assert "- Product B (DOWN)" in answer.answer


def test_structured_unhealthy_items_use_deterministic_tool_facts() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    assert answer.structured_content["items"] == [
        {
            "item_id": "product:customer-experience",
            "title": "Customer Experience",
            "state": "DOWN",
            "signals": [
                {
                    "id": "availability",
                    "title": "SLI: Customer-visible availability",
                    "state": "DOWN",
                }
            ],
            "affecting_dependencies": [
                {
                    "item_id": "product:experience-foundation",
                    "title": "Experience Foundation",
                    "state": "DOWN",
                    "signals": [
                        {
                            "id": "foundation-availability",
                            "title": "SLI: Foundation availability",
                            "state": "DOWN",
                        }
                    ],
                },
                {
                    "item_id": "product:experience-line",
                    "title": "Experience Line",
                    "state": "UNKNOWN",
                    "signals": [],
                },
                {
                    "item_id": "product:engagement-suite",
                    "title": "Engagement Suite",
                    "state": "DOWN",
                    "signals": [
                        {
                            "id": "engagement-availability",
                            "title": "SLI: Engagement availability",
                            "state": "DOWN",
                        }
                    ],
                },
            ],
        }
    ]


def test_dependency_with_no_own_unhealthy_signals_has_no_empty_signal_section() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())
    dependency = answer.structured_content["items"][0]["affecting_dependencies"][1]

    assert dependency["item_id"] == "product:experience-line"
    assert dependency["signals"] == []
    dependency_line_index = answer.answer.splitlines().index(
        "  - Experience Line (UNKNOWN)"
    )
    following_line = answer.answer.splitlines()[dependency_line_index + 1]
    assert following_line != "    Unhealthy signals:"


def test_dependency_signals_are_own_deterministic_facts_without_recursion() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())
    dependencies = answer.structured_content["items"][0]["affecting_dependencies"]
    foundation = dependencies[0]

    assert foundation["signals"] == [
        {
            "id": "foundation-availability",
            "title": "SLI: Foundation availability",
            "state": "DOWN",
        }
    ]
    assert "affecting_dependencies" not in foundation
    assert "Engagement Suite" not in str(foundation["signals"])


def test_plain_text_answer_uses_deduplicated_structured_representation() -> None:
    answer = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    assert answer.answer == (
        "The following items are currently unhealthy:\n"
        "- Customer Experience (DOWN)\n"
        "  Unhealthy signals: SLI: Customer-visible availability (DOWN)\n"
        "  Affecting dependencies:\n"
        "  - Experience Foundation (DOWN)\n"
        "    Unhealthy signals:\n"
        "    - SLI: Foundation availability (DOWN)\n"
        "  - Experience Line (UNKNOWN)\n"
        "  - Engagement Suite (DOWN)\n"
        "    Unhealthy signals:\n"
        "    - SLI: Engagement availability (DOWN)"
    )


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


def _answer_list_unhealthy_items(result: dict[str, Any]):
    tool = FakeTool(
        definition=ToolDefinition(
            name="list_unhealthy_items",
            description="List unhealthy items.",
            input_schema={"type": "object"},
        ),
        result=result,
    )
    model = FakeModelProvider(
        responses=[
            ModelResponse(
                text="Ignored by deterministic terminal renderer.",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="list_unhealthy_items",
                        arguments={},
                        presentation=PresentationMetadata(
                            header="The following items are currently unhealthy:",
                            signals_label="Unhealthy signals",
                            dependencies_label="Affecting dependencies",
                            healthy_message="No items are currently unhealthy.",
                        ),
                    )
                ],
            )
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("What is broken right now?")
    assert len(model.requests) == 1
    assert model.tool_choices == [ToolChoice.REQUIRED]
    return answer


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


def _nested_unhealthy_items_result() -> dict[str, Any]:
    return {
        "items": [
            {
                "itemId": "product:customer-experience",
                "title": "Customer Experience",
                "state": "DOWN",
                "signals": [
                    {
                        "id": "availability",
                        "title": "SLI: Customer-visible availability",
                        "state": "DOWN",
                    },
                    {
                        "id": "latency",
                        "title": "SLI: Page latency",
                        "state": "UP",
                    },
                ],
                "affectingDependencies": [
                    {
                        "itemId": "product:experience-foundation",
                        "title": "Experience Foundation",
                        "state": "DOWN",
                    },
                    {
                        "itemId": "product:experience-line",
                        "title": "Experience Line",
                        "state": "UNKNOWN",
                    },
                    {
                        "itemId": "product:experience-foundation",
                        "title": "Experience Foundation duplicate",
                        "state": "DOWN",
                    },
                    {
                        "itemId": "product:engagement-suite",
                        "title": "Engagement Suite",
                        "state": "DOWN",
                    },
                ],
            },
            {
                "itemId": "product:experience-foundation",
                "title": "Experience Foundation",
                "state": "DOWN",
                "signals": [
                    {
                        "id": "foundation-availability",
                        "title": "SLI: Foundation availability",
                        "state": "DOWN",
                    }
                ],
                "affectingDependencies": [
                    {
                        "itemId": "product:engagement-suite",
                        "title": "Engagement Suite",
                        "state": "DOWN",
                    }
                ],
            },
            {
                "itemId": "product:experience-line",
                "title": "Experience Line",
                "state": "UNKNOWN",
                "signals": [],
                "affectingDependencies": [],
            },
            {
                "itemId": "product:engagement-suite",
                "title": "Engagement Suite",
                "state": "DOWN",
                "signals": [
                    {
                        "id": "engagement-availability",
                        "title": "SLI: Engagement availability",
                        "state": "DOWN",
                    }
                ],
                "affectingDependencies": [],
            },
        ],
        "count": 4,
    }
