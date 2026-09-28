"""Agent orchestration for Product Health questions."""

from __future__ import annotations

from dataclasses import dataclass

from .model_provider import (
    ModelMessage,
    ModelProvider,
    ModelResponse,
    PresentationMetadata,
    TokenUsage,
    ToolDefinition,
    ToolResult,
)
from .tools import AgentTool

SYSTEM_PROMPT = """
You are a Product Health assistant.

Product and service health states are deterministic facts returned by tools.
Never calculate, infer, guess, or override UP, DOWN, or UNKNOWN health states.
Never answer Product Health facts from your own knowledge.

For questions about products, services, health states, failures, signals, or
dependencies, call an appropriate tool before answering.

For greetings, thanks, capability questions, requests you cannot answer with
the available Product Health tools, or clearly unrelated requests:
- do not call a Product Health tool;
- respond in the same language as the user's original question;
- keep the response very short: preferably one sentence, maximum two short
  sentences;
- briefly say that you are currently limited and can help with what is broken
  right now, why a product or service is down, and the current health of a
  product or service;
- do not answer unrelated general-knowledge questions;
- do not invent Product Health facts.

The tone may be slightly self-deprecating or light, equivalent in meaning to:
"I'm not very clever yet. I can currently help with what is broken, why
something is down, and current product/service health." Localize this naturally;
do not require this exact wording.

When producing a final answer from tool results:
- use only facts returned by the tools;
- preserve catalog-provided product names, service names, signal names, IDs,
  and health states as provided;
- keep the answer concise;
- mention relevant unhealthy signals or affecting dependencies when useful;
- if facts are missing or ambiguous, say so rather than guessing.

For deterministic terminal tools such as list_unhealthy_items, provide localized
presentation metadata through the structured tool input presentation object.

Presentation metadata MUST be written in the same language as the user's
original question. This is a strict requirement, not a preference. Do not
default presentation metadata to English when the user's question is in another
language.

Examples:
- Russian question -> Russian presentation labels.
- English question -> English presentation labels.
- Serbian question -> Serbian presentation labels.

Presentation metadata is presentation only, not Product Health data.
It must be generic and fact-free.

Presentation labels must:
- be short, neutral UI-style labels or statements;
- be declarative, not questions;
- not repeat, quote, or paraphrase the user's question;
- not imitate emotional, humorous, or informal wording from the user's question;
- not contain product names, service names, catalog IDs, health states, counts,
  dependency names, signal names, or causes;
- preserve catalog-provided product names, service names, signal names, IDs, and
  health states exactly as provided by Product Health; only presentation labels
  are localized;
- avoid wording that depends on dynamic counts, plural forms, or grammatical
  agreement with values that are not yet known.

For list_unhealthy_items, use these meanings:
- header: a short heading meaning that unhealthy items are listed below;
- signals_label: a short label for unhealthy signals;
- dependencies_label: a short label for affecting dependencies;
- healthy_message: a short complete statement that no items are currently unhealthy.

Health facts will be inserted later by the agent.
""".strip()

CAPABILITY_FALLBACK_RESPONSE = """
Sorry, I'm not very clever yet. I can currently help with questions like:
- What is broken right now?
- Why is <product or service> down?
- What is the current health of <product or service>?
""".strip()


@dataclass(frozen=True)
class AgentAnswer:
    answer: str
    tool_calls: list[str]
    usage: TokenUsage


class ProductHealthAgent:
    """Small model/tool loop that never computes health itself."""

    def __init__(
        self,
        model_provider: ModelProvider,
        tools: list[AgentTool],
        max_tool_rounds: int = 2,
    ) -> None:
        self.model_provider = model_provider
        self.tools_by_name = {tool.definition.name: tool for tool in tools}
        self.tool_definitions: list[ToolDefinition] = [
            tool.definition for tool in tools
        ]
        self.max_tool_rounds = max(1, max_tool_rounds)

    def answer(self, question: str) -> AgentAnswer:
        if not self.model_provider.is_available():
            reason = getattr(
                self.model_provider,
                "reason",
                "AI model provider is not configured.",
            )
            raise RuntimeError(str(reason))
        normalized_question = question.strip()
        if not normalized_question:
            raise ValueError("question must not be blank")

        messages = [ModelMessage(role="user", text=normalized_question)]
        executed_tool_names: list[str] = []
        usage = TokenUsage()

        for _ in range(self.max_tool_rounds):
            response = self._complete(messages)
            usage = usage.plus(response.usage)
            messages.append(
                ModelMessage(
                    role="assistant",
                    text=response.text,
                    tool_calls=response.tool_calls,
                )
            )
            if not response.tool_calls:
                if not executed_tool_names:
                    return AgentAnswer(
                        answer=_text(response.text) or CAPABILITY_FALLBACK_RESPONSE,
                        tool_calls=[],
                        usage=usage,
                    )
                return AgentAnswer(
                    answer=response.text,
                    tool_calls=executed_tool_names,
                    usage=usage,
                )

            tool_results = []
            for tool_call in response.tool_calls:
                tool = self.tools_by_name.get(tool_call.name)
                if tool is None:
                    raise ValueError(f"Unsupported tool: {tool_call.name}")
                executed_tool_names.append(tool_call.name)
                tool_results.append(
                    ToolResult(
                        tool_call_id=tool_call.id,
                        result=tool.execute(tool_call.arguments),
                    )
                )
                if tool_call.name == "list_unhealthy_items":
                    return AgentAnswer(
                        answer=_render_list_unhealthy_items(
                            tool_results[-1].result,
                            tool_call.presentation,
                        ),
                        tool_calls=executed_tool_names,
                        usage=usage,
                    )
            messages.append(ModelMessage(role="tool", tool_results=tool_results))

        final_response = self._complete(messages)
        usage = usage.plus(final_response.usage)
        return AgentAnswer(
            answer=final_response.text,
            tool_calls=executed_tool_names,
            usage=usage,
        )

    def _complete(self, messages: list[ModelMessage]) -> ModelResponse:
        return self.model_provider.complete(
            system_prompt=SYSTEM_PROMPT,
            messages=messages,
            tools=self.tool_definitions,
        )


@dataclass(frozen=True)
class _ListUnhealthyItemsLabels:
    header: str
    signals_label: str
    dependencies_label: str
    healthy_message: str


_ENGLISH_LIST_UNHEALTHY_ITEMS_LABELS = _ListUnhealthyItemsLabels(
    header="The following items are currently unhealthy:",
    signals_label="Unhealthy signals",
    dependencies_label="Affecting dependencies",
    healthy_message="No items are currently unhealthy.",
)


def _render_list_unhealthy_items(
    result: dict,
    presentation: PresentationMetadata | None = None,
) -> str:
    items = result.get("items")
    if not isinstance(items, list):
        items = []
    count = result.get("count")
    if not isinstance(count, int):
        count = len(items)
    labels = _list_unhealthy_items_labels(presentation, result, items, count)

    if count == 0:
        return labels.healthy_message

    lines = [labels.header]
    for item in items:
        if not isinstance(item, dict):
            continue
        title = _text(item.get("title")) or _text(item.get("itemId")) or "Unknown item"
        state = _text(item.get("state")) or "UNKNOWN"
        lines.append(f"- {title} ({state})")

        signal_details = _unhealthy_signal_details(item.get("signals"))
        if signal_details:
            lines.append(f"  {labels.signals_label}: {', '.join(signal_details)}")

        dependency_details = _dependency_details(
            item.get("affectingDependencies")
        )
        if dependency_details:
            lines.append(
                f"  {labels.dependencies_label}: {', '.join(dependency_details)}"
            )

    return "\n".join(lines)


def _list_unhealthy_items_labels(
    presentation: PresentationMetadata | None,
    result: dict,
    items: list[object],
    count: int,
) -> _ListUnhealthyItemsLabels:
    if presentation is None:
        return _ENGLISH_LIST_UNHEALTHY_ITEMS_LABELS

    values = {
        "header": presentation.header,
        "signals_label": presentation.signals_label,
        "dependencies_label": presentation.dependencies_label,
        "healthy_message": presentation.healthy_message,
    }
    if any(_text(value) is None for value in values.values()):
        return _ENGLISH_LIST_UNHEALTHY_ITEMS_LABELS
    if any(
        _contains_forbidden_fact(value, result, items, count)
        for value in values.values()
    ):
        return _ENGLISH_LIST_UNHEALTHY_ITEMS_LABELS
    return _ListUnhealthyItemsLabels(
        header=presentation.header.strip(),
        signals_label=presentation.signals_label.strip(),
        dependencies_label=presentation.dependencies_label.strip(),
        healthy_message=presentation.healthy_message.strip(),
    )


def _contains_forbidden_fact(
    value: str,
    result: dict,
    items: list[object],
    count: int,
) -> bool:
    normalized = value.casefold()
    if str(count) in value:
        return True
    forbidden = {"UP", "DOWN", "UNKNOWN"}
    forbidden.update(_fact_strings(result))
    for item in items:
        if isinstance(item, dict):
            forbidden.update(_fact_strings(item))
            for signal in _list_or_empty(item.get("signals")):
                if isinstance(signal, dict):
                    forbidden.update(_fact_strings(signal))
            for dependency in _list_or_empty(item.get("affectingDependencies")):
                if isinstance(dependency, dict):
                    forbidden.update(_fact_strings(dependency))
    return any(fact.casefold() in normalized for fact in forbidden if fact)


def _fact_strings(value: dict) -> set[str]:
    facts = set()
    for key in ("itemId", "id", "title", "state", "source"):
        text = _text(value.get(key))
        if text:
            facts.add(text)
    return facts


def _list_or_empty(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _unhealthy_signal_details(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    details = []
    for signal in value:
        if not isinstance(signal, dict):
            continue
        state = _text(signal.get("state"))
        if state == "UP":
            continue
        title = _text(signal.get("title")) or _text(signal.get("id"))
        if title and state:
            details.append(f"{title} ({state})")
    return details


def _dependency_details(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    details = []
    for dependency in value:
        if not isinstance(dependency, dict):
            continue
        title = _text(dependency.get("title")) or _text(dependency.get("itemId"))
        state = _text(dependency.get("state"))
        if title and state:
            details.append(f"{title} ({state})")
    return details


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None
