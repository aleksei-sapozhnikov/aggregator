"""Provider-neutral model contracts used by the agent orchestration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    input_schema: JsonObject


@dataclass(frozen=True)
class PresentationMetadata:
    header: str
    signals_label: str
    dependencies_label: str
    healthy_message: str


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: JsonObject
    presentation: PresentationMetadata | None = None


@dataclass(frozen=True)
class ToolResult:
    tool_call_id: str
    result: JsonObject


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None

    def plus(self, other: TokenUsage | None) -> TokenUsage:
        if other is None:
            return self
        return TokenUsage(
            input_tokens=_add(self.input_tokens, other.input_tokens),
            output_tokens=_add(self.output_tokens, other.output_tokens),
            total_tokens=_add(self.total_tokens, other.total_tokens),
        )


@dataclass(frozen=True)
class ModelMessage:
    role: str
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)


@dataclass(frozen=True)
class ModelResponse:
    text: str
    tool_calls: list[ToolCall]
    usage: TokenUsage = field(default_factory=TokenUsage)


class ModelProvider(Protocol):
    """Provider-neutral model boundary."""

    def is_available(self) -> bool:
        """Return whether the provider can currently serve requests."""

    def complete(
        self,
        *,
        system_prompt: str,
        messages: list[ModelMessage],
        tools: list[ToolDefinition],
    ) -> ModelResponse:
        """Complete one model turn."""


class UnavailableModelProvider:
    """Provider used when the optional AI capability is not configured."""

    def __init__(self, reason: str) -> None:
        self.reason = reason

    def is_available(self) -> bool:
        return False

    def complete(
        self,
        *,
        system_prompt: str,
        messages: list[ModelMessage],
        tools: list[ToolDefinition],
    ) -> ModelResponse:
        raise RuntimeError(self.reason)


def _add(left: int | None, right: int | None) -> int | None:
    if left is None:
        return right
    if right is None:
        return left
    return left + right
