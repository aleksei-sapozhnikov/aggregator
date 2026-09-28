"""Amazon Bedrock model provider adapter."""

from __future__ import annotations

import logging
import os
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from .model_provider import (
    ModelMessage,
    ModelProvider,
    ModelResponse,
    PresentationMetadata,
    TokenUsage,
    ToolCall,
    ToolChoice,
    ToolDefinition,
)

logger = logging.getLogger(__name__)


class BedrockModelProvider(ModelProvider):
    """Bedrock Converse implementation.

    boto3 uses the normal AWS credential chain, so EC2 can later use an IAM role
    without application-specific credential handling.
    """

    def __init__(
        self,
        model_id: str,
        aws_region: str | None = None,
        api_key: str | None = None,
        aws_access_key_id: str | None = None,
        aws_secret_access_key: str | None = None,
        aws_session_token: str | None = None,
    ) -> None:
        self.provider_name = "bedrock"
        self.model_id = model_id
        self.aws_region = aws_region
        self.api_key = api_key
        self.client_kwargs = _client_kwargs(
            aws_region=aws_region,
            api_key=api_key,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
            aws_session_token=aws_session_token,
        )
        self.client = None

    @classmethod
    def from_config(cls, config: dict[str, Any]) -> BedrockModelProvider:
        bedrock_config = config.get("bedrock", {})
        if not isinstance(bedrock_config, dict):
            bedrock_config = {}
        return cls(
            model_id=str(bedrock_config.get("model_id", "")).strip(),
            aws_region=_optional_text(bedrock_config.get("aws_region")),
            api_key=_optional_text(bedrock_config.get("api_key")),
            aws_access_key_id=_optional_text(bedrock_config.get("aws_access_key_id")),
            aws_secret_access_key=_optional_text(
                bedrock_config.get("aws_secret_access_key")
            ),
            aws_session_token=_optional_text(bedrock_config.get("aws_session_token")),
        )

    def is_available(self) -> bool:
        return bool(self.model_id)

    def _client(self):
        if self.client is None:
            self.client = _bedrock_client(self.client_kwargs, self.api_key)
        return self.client

    def complete(
        self,
        *,
        system_prompt: str,
        messages: list[ModelMessage],
        tools: list[ToolDefinition],
        tool_choice: ToolChoice = ToolChoice.AUTO,
    ) -> ModelResponse:
        try:
            response = self._client().converse(
                modelId=self.model_id,
                system=[{"text": system_prompt}],
                messages=[self._to_bedrock_message(message) for message in messages],
                toolConfig=_tool_config(tools, tool_choice),
            )
        except (BotoCoreError, ClientError) as exc:
            logger.exception(
                "Model provider request failed. provider=%s model_id=%s "
                "aws_region=%s operation=%s",
                self.provider_name,
                self.model_id,
                self.aws_region or "default",
                "bedrock-runtime.converse",
            )
            raise RuntimeError("Model provider request failed.") from exc
        content = response.get("output", {}).get("message", {}).get("content", [])
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in content:
            if "text" in block:
                text_parts.append(str(block["text"]))
            tool_use = block.get("toolUse")
            if isinstance(tool_use, dict):
                tool_calls.append(_tool_call_from_tool_use(tool_use))
        usage = response.get("usage") or {}
        text = "".join(text_parts)
        return ModelResponse(
            text=text,
            tool_calls=tool_calls,
            usage=TokenUsage(
                input_tokens=usage.get("inputTokens"),
                output_tokens=usage.get("outputTokens"),
                total_tokens=usage.get("totalTokens"),
            ),
        )

    def _to_bedrock_message(self, message: ModelMessage) -> dict[str, Any]:
        if message.role == "tool":
            return {
                "role": "user",
                "content": [
                    {
                        "toolResult": {
                            "toolUseId": tool_result.tool_call_id,
                            "content": [{"json": tool_result.result}],
                        }
                    }
                    for tool_result in message.tool_results
                ],
            }

        content: list[dict[str, Any]] = []
        if message.text:
            content.append({"text": message.text})
        for tool_call in message.tool_calls:
            content.append(
                {
                    "toolUse": {
                        "toolUseId": tool_call.id,
                        "name": tool_call.name,
                        "input": tool_call.arguments,
                    }
                }
            )
        return {
            "role": "assistant" if message.role == "assistant" else "user",
            "content": content,
        }


def _tool_config(
    tools: list[ToolDefinition],
    tool_choice: ToolChoice,
) -> dict[str, Any]:
    tool_config: dict[str, Any] = {
        "tools": [
            {
                "toolSpec": {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": {"json": tool.input_schema},
                }
            }
            for tool in tools
        ]
    }
    if tool_choice == ToolChoice.REQUIRED:
        tool_config["toolChoice"] = {"any": {}}
    return tool_config


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _tool_call_from_tool_use(tool_use: dict[str, Any]) -> ToolCall:
    arguments = _dict_or_empty(tool_use.get("input")).copy()
    presentation = _presentation_from_arguments(arguments)
    arguments.pop("presentation", None)
    return ToolCall(
        id=str(tool_use.get("toolUseId", "")),
        name=str(tool_use.get("name", "")),
        arguments=arguments,
        presentation=presentation,
    )


def _presentation_from_arguments(
    arguments: dict[str, Any]
) -> PresentationMetadata | None:
    presentation = arguments.get("presentation")
    if not isinstance(presentation, dict):
        return None
    if any(
        not isinstance(presentation.get(field), str)
        for field in (
            "header",
            "signals_label",
            "dependencies_label",
            "healthy_message",
        )
    ):
        return None
    return PresentationMetadata(
        header=presentation["header"],
        signals_label=presentation["signals_label"],
        dependencies_label=presentation["dependencies_label"],
        healthy_message=presentation["healthy_message"],
    )


def _bedrock_client(client_kwargs: dict[str, str | None], api_key: str | None):
    if api_key:
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = api_key
    return boto3.client(
        "bedrock-runtime",
        **{key: value for key, value in client_kwargs.items() if value},
    )


def _optional_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def _client_kwargs(
    *,
    aws_region: str | None,
    api_key: str | None,
    aws_access_key_id: str | None,
    aws_secret_access_key: str | None,
    aws_session_token: str | None,
) -> dict[str, str | None]:
    if api_key:
        return {"region_name": aws_region}
    return {
        "region_name": aws_region,
        "aws_access_key_id": aws_access_key_id,
        "aws_secret_access_key": aws_secret_access_key,
        "aws_session_token": aws_session_token,
    }
