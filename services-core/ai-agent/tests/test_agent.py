from dataclasses import dataclass, field
from typing import Any

import pytest
from product_health_agent.agent import (
    CAPABILITY_FALLBACK_RESPONSE,
    RESPOND_WITH_CAPABILITIES_TOOL_NAME,
    RESPOND_WITH_PRODUCT_HEALTH_INTRO_TOOL_NAME,
    SYSTEM_PROMPT,
    ProductHealthAgent,
)
from product_health_agent.model_provider import (
    ModelMessage,
    ModelProvider,
    ModelResponse,
    TokenUsage,
    ToolCall,
    ToolChoice,
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


def test_system_prompt_limits_structured_result_answer_to_intro() -> None:
    prompt = " ".join(SYSTEM_PROMPT.split())

    assert "short introduction sentence" in prompt
    assert "not include dependency lists, signal lists, repeated facts" in prompt
    assert "presentation metadata" not in prompt


def test_agent_exposes_local_capability_action_to_model() -> None:
    model = FakeModelProvider([ModelResponse(text="", tool_calls=[])])

    ProductHealthAgent(model, [_tool("list_unhealthy_items", {})]).answer("Hi")

    capability_tool = {
        definition.name: definition for definition in model.tool_requests[0]
    }[RESPOND_WITH_CAPABILITIES_TOOL_NAME]
    assert capability_tool.input_schema["required"] == ["message"]
    assert "XML/HTML-style tags" in capability_tool.input_schema["properties"][
        "message"
    ]["description"]


def test_agent_executes_tool_before_answering_plain_specific_followup() -> None:
    tool = _tool(
        "get_product_health",
        {"found": False, "query": "Chekout", "candidates": [], "message": "No match."},
    )
    model = FakeModelProvider(
        [
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="get_product_health",
                        arguments={"query": "Chekout"},
                    )
                ],
                usage=TokenUsage(input_tokens=10, output_tokens=3, total_tokens=13),
            ),
            ModelResponse(
                text="I couldn't find a matching Product Health item.",
                tool_calls=[],
                usage=TokenUsage(input_tokens=20, output_tokens=8, total_tokens=28),
            ),
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer("Health of Chekout?")

    assert answer.answer == "I couldn't find a matching Product Health item."
    assert answer.structured_content is None
    assert answer.tool_calls == ["get_product_health"]
    assert answer.usage.total_tokens == 41
    assert model.requests[1][-1].tool_results[0].result["found"] is False


def test_agent_returns_structured_unhealthy_items_with_model_intro() -> None:
    answer, model = _answer_list_unhealthy_items(
        _unhealthy_items_result(),
        intro="Here are the unhealthy signals affecting your products.",
    )

    assert answer.answer == "Here are the unhealthy signals affecting your products."
    assert answer.structured_content == {
        "type": "product_health",
        "scope": "unhealthy_items",
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
    assert len(model.requests) == 2
    assert model.tool_choices == [ToolChoice.REQUIRED, ToolChoice.REQUIRED]
    intro_tool = {
        definition.name: definition for definition in model.tool_requests[1]
    }[RESPOND_WITH_PRODUCT_HEALTH_INTRO_TOOL_NAME]
    assert intro_tool.input_schema["required"] == ["introduction"]
    assert "Commerce Core" not in answer.answer
    assert "dependencies" not in answer.answer.lower()


def test_agent_uses_russian_model_intro_for_structured_results() -> None:
    answer, _ = _answer_list_unhealthy_items(
        _unhealthy_items_result(),
        intro="Вот нездоровые сигналы, влияющие на ваши продукты.",
        question="Что сейчас сломано?",
    )

    assert answer.answer == "Вот нездоровые сигналы, влияющие на ваши продукты."
    assert answer.structured_content["scope"] == "unhealthy_items"


def test_agent_returns_empty_unhealthy_items_with_intro() -> None:
    answer, _ = _answer_list_unhealthy_items(
        {"items": [], "count": 0},
        intro="All products are currently healthy.",
    )

    assert answer.answer == "All products are currently healthy."
    assert answer.structured_content == {
        "type": "product_health",
        "scope": "unhealthy_items",
        "items": [],
    }


def test_agent_returns_structured_specific_item_with_same_template() -> None:
    tool = _tool("get_product_health", _specific_item_lookup_result())
    model = FakeModelProvider(
        [
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="get_product_health",
                        arguments={"query": "Customer Experience"},
                    )
                ],
            ),
            ModelResponse(
                text="",
                tool_calls=[
                    _intro_call("Here is the current health for the selected item.")
                ],
            ),
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer(
        "What is the health of Customer Experience?"
    )

    assert answer.answer == "Here is the current health for the selected item."
    assert answer.structured_content == {
        "type": "product_health",
        "scope": "item",
        "items": [
            {
                "item_id": "product:customer-experience",
                "title": "Customer Experience",
                "state": "DOWN",
                "signals": [
                    {
                        "id": "availability",
                        "title": "Customer availability",
                        "state": "DOWN",
                    }
                ],
                "affecting_dependencies": [
                    {
                        "item_id": "product:experience-foundation",
                        "title": "Experience Foundation",
                        "state": "DOWN",
                        "signals": [],
                    },
                    {
                        "item_id": "product:campaign-planner-nodes",
                        "title": "Campaign Planner Nodes",
                        "state": "UNKNOWN",
                        "signals": [
                            {
                                "id": "node-heartbeat",
                                "title": "Node heartbeat",
                                "state": "UNKNOWN",
                            }
                        ],
                    }
                ],
            }
        ],
    }


def test_specific_healthy_and_unknown_items_still_return_structured_state() -> None:
    for state in ("UP", "UNKNOWN"):
        tool = _tool(
            "get_product_health",
            {
                "found": True,
                "item": {
                    "itemId": f"product:{state.lower()}",
                    "title": f"{state} Product",
                    "state": state,
                    "signals": [],
                    "affectingDependencies": [],
                },
                "relatedUnhealthyItems": [],
            },
        )
        model = FakeModelProvider(
            [
                ModelResponse(
                    text="",
                    tool_calls=[
                        ToolCall(
                            id="tool-1",
                            name="get_product_health",
                            arguments={"query": state},
                        )
                    ],
                ),
                ModelResponse(
                    text="",
                    tool_calls=[_intro_call(f"Here is the current health of {state}.")],
                ),
            ]
        )

        answer = ProductHealthAgent(model, [tool]).answer(f"Health of {state}?")

        assert answer.structured_content["items"][0]["state"] == state
        assert answer.structured_content["items"][0]["signals"] == []


def test_specific_item_scope_wins_when_global_tool_is_also_called() -> None:
    tools = [
        _tool("list_unhealthy_items", _unhealthy_items_result()),
        _tool("get_product_health", _specific_item_lookup_result()),
    ]
    model = FakeModelProvider(
        [
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(
                        id="tool-1",
                        name="list_unhealthy_items",
                        arguments={},
                    ),
                    ToolCall(
                        id="tool-2",
                        name="get_product_health",
                        arguments={"query": "Operations Suite"},
                    ),
                ],
            ),
            ModelResponse(
                text="",
                tool_calls=[_intro_call("Here is the current health for Operations Suite.")],
            ),
        ]
    )

    answer = ProductHealthAgent(model, tools).answer("Health of Operations Suite?")

    assert answer.structured_content["scope"] == "item"
    assert [item["item_id"] for item in answer.structured_content["items"]] == [
        "product:customer-experience"
    ]
    assert "product:commerce-platform" not in str(answer.structured_content)
    assert answer.tool_calls == ["list_unhealthy_items", "get_product_health"]


def test_specific_missing_result_does_not_fall_back_to_global_list() -> None:
    tools = [
        _tool("list_unhealthy_items", _unhealthy_items_result()),
        _tool(
            "get_product_health",
            {
                "found": False,
                "query": "Ops",
                "item": None,
                "candidates": [],
                "message": "No catalog item matched the query.",
            },
        ),
    ]
    model = FakeModelProvider(
        [
            ModelResponse(
                text="",
                tool_calls=[
                    ToolCall(id="tool-1", name="list_unhealthy_items", arguments={}),
                    ToolCall(
                        id="tool-2",
                        name="get_product_health",
                        arguments={"query": "Ops"},
                    ),
                ],
            ),
            ModelResponse(
                text="I couldn't find a matching Product Health item.",
                tool_calls=[],
            ),
        ]
    )

    answer = ProductHealthAgent(model, tools).answer("Health of Ops?")

    assert answer.structured_content is None
    assert answer.answer == "I couldn't find a matching Product Health item."
    assert "Commerce Platform" not in answer.answer


def test_global_unhealthy_scope_still_renders_global_list() -> None:
    answer, _ = _answer_list_unhealthy_items(_unhealthy_items_result())

    assert answer.structured_content["scope"] == "unhealthy_items"
    assert [item["item_id"] for item in answer.structured_content["items"]] == [
        "product:commerce-platform"
    ]


def test_list_unhealthy_items_removes_dependency_items_from_top_level() -> None:
    answer, _ = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    assert [item["item_id"] for item in answer.structured_content["items"]] == [
        "product:customer-experience"
    ]


def test_structured_dependencies_preserve_only_own_unhealthy_signal_facts() -> None:
    answer, _ = _answer_list_unhealthy_items(_nested_unhealthy_items_result())

    dependencies = answer.structured_content["items"][0]["affecting_dependencies"]
    assert [
        dependency["item_id"] for dependency in dependencies
    ] == [
        "product:experience-foundation",
        "product:experience-line",
        "product:engagement-suite",
    ]
    assert dependencies[1]["signals"] == []
    assert "affecting_dependencies" not in dependencies[0]
    assert dependencies[2]["signals"] == [
        {
            "id": "engagement-availability",
            "title": "SLI: Engagement availability",
            "state": "DOWN",
        }
    ]


def test_agent_strips_reasoning_blocks_from_structured_intro() -> None:
    answer, _ = _answer_list_unhealthy_items(
        _unhealthy_items_result(),
        intro="<thinking>internal</thinking> Here are the current Product Health results.",
    )

    assert answer.answer == "Here are the current Product Health results."
    assert "<thinking>" not in answer.answer
    assert "internal" not in answer.answer


def test_agent_uses_localized_fallback_when_intro_is_only_reasoning() -> None:
    answer, _ = _answer_list_unhealthy_items(
        _unhealthy_items_result(),
        intro="<thinking>internal</thinking>",
    )

    assert answer.answer == "Here are the current Product Health results."


@pytest.mark.parametrize(
    "arguments",
    [
        {},
        {"message": ""},
        {"message": "   "},
        {"message": 42},
        {"message": "<thinking>internal</thinking> I only support Product Health."},
    ],
)
def test_agent_uses_deterministic_fallback_for_invalid_capability_message(
    arguments: dict[str, Any],
) -> None:
    model = FakeModelProvider(
        [
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

    answer = ProductHealthAgent(
        model, [_tool("list_unhealthy_items", {})]
    ).answer("Hi")

    assert answer.answer == CAPABILITY_FALLBACK_RESPONSE
    assert "<thinking>" not in answer.answer
    assert answer.tool_calls == [RESPOND_WITH_CAPABILITIES_TOOL_NAME]


def test_agent_rejects_unknown_tool() -> None:
    model = FakeModelProvider(
        [ModelResponse(text="", tool_calls=[ToolCall("tool-1", "unknown_tool", {})])]
    )

    with pytest.raises(ValueError, match="Unsupported tool"):
        ProductHealthAgent(
            model, [_tool("list_unhealthy_items", {})]
        ).answer("What is broken?")


def _tool(name: str, result: dict[str, Any]) -> FakeTool:
    return FakeTool(
        definition=ToolDefinition(
            name=name,
            description=f"{name} tool.",
            input_schema={"type": "object"},
        ),
        result=result,
    )


def _answer_list_unhealthy_items(
    result: dict[str, Any],
    intro: str = "Here are the current Product Health results.",
    question: str = "What is broken right now?",
):
    tool = _tool("list_unhealthy_items", result)
    model = FakeModelProvider(
        [
            ModelResponse(
                text="Ignored by structured renderer.",
                tool_calls=[ToolCall(id="tool-1", name="list_unhealthy_items", arguments={})],
            ),
            ModelResponse(text="", tool_calls=[_intro_call(intro)]),
        ]
    )

    answer = ProductHealthAgent(model, [tool]).answer(question)
    return answer, model


def _intro_call(introduction: str) -> ToolCall:
    return ToolCall(
        id="intro-1",
        name=RESPOND_WITH_PRODUCT_HEALTH_INTRO_TOOL_NAME,
        arguments={"introduction": introduction},
    )


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


def _specific_item_lookup_result() -> dict[str, Any]:
    return {
        "found": True,
        "item": {
            "itemId": "product:customer-experience",
            "title": "Customer Experience",
            "state": "DOWN",
            "signals": [
                {
                    "id": "availability",
                    "title": "Customer availability",
                    "state": "DOWN",
                }
            ],
            "affectingDependencies": [
                {
                    "itemId": "product:experience-foundation",
                    "title": "Experience Foundation",
                    "state": "DOWN",
                },
                {
                    "itemId": "product:campaign-planner-nodes",
                    "title": "Campaign Planner Nodes",
                    "state": "UNKNOWN",
                },
            ],
        },
        "relatedUnhealthyItems": [
            {
                "itemId": "product:experience-foundation",
                "title": "Experience Foundation",
                "state": "DOWN",
                "signals": [],
                "affectingDependencies": [
                    {
                        "itemId": "product:campaign-planner-nodes",
                        "title": "Campaign Planner Nodes",
                        "state": "UNKNOWN",
                    }
                ],
            },
            {
                "itemId": "product:campaign-planner-nodes",
                "title": "Campaign Planner Nodes",
                "state": "UNKNOWN",
                "signals": [
                    {
                        "id": "node-heartbeat",
                        "title": "Node heartbeat",
                        "state": "UNKNOWN",
                    }
                ],
                "affectingDependencies": [],
            },
        ],
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
                "affectingDependencies": [],
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
