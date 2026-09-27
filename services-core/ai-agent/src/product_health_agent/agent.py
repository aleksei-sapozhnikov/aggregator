"""Agent orchestration for Product Health questions."""

from __future__ import annotations

from dataclasses import dataclass

from .model_provider import (
    ModelMessage,
    ModelProvider,
    ModelResponse,
    TokenUsage,
    ToolDefinition,
    ToolResult,
)
from .tools import AgentTool

SYSTEM_PROMPT = """
You explain Product Health facts to users.
Product and service health states are deterministic facts returned by tools.
Never calculate, infer, or override UP, DOWN, or UNKNOWN health state yourself.
Always call a tool before answering.
If facts are missing or ambiguous, say so and mention the available candidates.
Keep the answer concise and cite the relevant unhealthy signals or dependencies from tool facts.
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
                    raise RuntimeError(
                        "Model returned no tool call for a Product Health question."
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
