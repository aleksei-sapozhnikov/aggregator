import logging
import os

import pytest
from botocore.exceptions import ReadTimeoutError
from product_health_agent.bedrock_provider import BedrockModelProvider
from product_health_agent.model_provider import ToolChoice, ToolDefinition


class TimeoutClient:
    def converse(self, **kwargs):
        raise ReadTimeoutError(endpoint_url="https://bedrock-runtime.example")


class StaticClient:
    def __init__(self, response) -> None:
        self.response = response
        self.calls = []

    def converse(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


def test_bedrock_timeout_is_reported_as_provider_failure(caplog) -> None:
    provider = BedrockModelProvider(
        model_id="model-id",
        aws_region="eu-central-1",
        api_key="bedrock-api-key",
        aws_access_key_id="access-key",
        aws_secret_access_key="secret-key",
        aws_session_token="session-token",
    )
    provider.client = TimeoutClient()

    with (
        caplog.at_level(logging.ERROR),
        pytest.raises(RuntimeError, match="Model provider request failed") as error,
    ):
        provider.complete(system_prompt="system", messages=[], tools=[])

    assert isinstance(error.value.__cause__, ReadTimeoutError)
    assert "provider=bedrock" in caplog.text
    assert "model_id=model-id" in caplog.text
    assert "aws_region=eu-central-1" in caplog.text
    assert "operation=bedrock-runtime.converse" in caplog.text
    assert "Traceback" in caplog.text
    assert "bedrock-api-key" not in caplog.text
    assert "access-key" not in caplog.text
    assert "secret-key" not in caplog.text
    assert "session-token" not in caplog.text


def test_bedrock_api_key_sets_bearer_token_without_aws_credentials(
    monkeypatch,
) -> None:
    calls = []

    def fake_client(service_name, **kwargs):
        calls.append((service_name, kwargs, os.environ.get("AWS_BEARER_TOKEN_BEDROCK")))
        return object()

    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    monkeypatch.setattr(
        "product_health_agent.bedrock_provider.boto3.client", fake_client
    )
    provider = BedrockModelProvider.from_config(
        {
            "bedrock": {
                "model_id": "eu.amazon.nova-lite-v1:0",
                "aws_region": "eu-central-1",
                "api_key": "bedrock-api-key",
                "aws_access_key_id": "access-key",
                "aws_secret_access_key": "secret-key",
                "aws_session_token": "session-token",
            }
        }
    )

    provider._client()

    assert calls == [
        (
            "bedrock-runtime",
            {"region_name": "eu-central-1"},
            "bedrock-api-key",
        )
    ]


def test_bedrock_explicit_aws_credentials_are_passed_without_api_key(
    monkeypatch,
) -> None:
    calls = []

    def fake_client(service_name, **kwargs):
        calls.append((service_name, kwargs, os.environ.get("AWS_BEARER_TOKEN_BEDROCK")))
        return object()

    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    monkeypatch.setattr(
        "product_health_agent.bedrock_provider.boto3.client", fake_client
    )
    provider = BedrockModelProvider.from_config(
        {
            "bedrock": {
                "model_id": "model-id",
                "aws_region": "eu-central-1",
                "aws_access_key_id": "access-key",
                "aws_secret_access_key": "secret-key",
                "aws_session_token": "session-token",
            }
        }
    )

    provider._client()

    assert calls == [
        (
            "bedrock-runtime",
            {
                "region_name": "eu-central-1",
                "aws_access_key_id": "access-key",
                "aws_secret_access_key": "secret-key",
                "aws_session_token": "session-token",
            },
            None,
        )
    ]


def test_bedrock_default_credential_chain_uses_no_explicit_credentials(
    monkeypatch,
) -> None:
    calls = []

    def fake_client(service_name, **kwargs):
        calls.append((service_name, kwargs, os.environ.get("AWS_BEARER_TOKEN_BEDROCK")))
        return object()

    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    monkeypatch.setattr(
        "product_health_agent.bedrock_provider.boto3.client", fake_client
    )
    provider = BedrockModelProvider.from_config(
        {"bedrock": {"model_id": "model-id", "aws_region": "eu-central-1"}}
    )

    provider._client()

    assert calls == [
        (
            "bedrock-runtime",
            {"region_name": "eu-central-1"},
            None,
        )
    ]


def test_bedrock_converse_receives_default_inference_config() -> None:
    provider = BedrockModelProvider(model_id="model-id")
    client = StaticClient(_empty_message_response())
    provider.client = client

    provider.complete(system_prompt="system", messages=[], tools=[])

    assert client.calls[0]["inferenceConfig"] == {
        "temperature": 0.00001,
        "maxTokens": 300,
    }


def test_bedrock_configured_inference_settings_override_defaults() -> None:
    provider = BedrockModelProvider.from_config(
        {
            "bedrock": {
                "model_id": "model-id",
                "temperature": 0.2,
                "max_tokens": 123,
            }
        }
    )
    client = StaticClient(_empty_message_response())
    provider.client = client

    provider.complete(system_prompt="system", messages=[], tools=[])

    assert client.calls[0]["inferenceConfig"] == {
        "temperature": 0.2,
        "maxTokens": 123,
    }


def test_bedrock_inference_settings_do_not_affect_credentials(
    monkeypatch,
) -> None:
    calls = []

    def fake_client(service_name, **kwargs):
        calls.append((service_name, kwargs, os.environ.get("AWS_BEARER_TOKEN_BEDROCK")))
        return object()

    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    monkeypatch.setattr(
        "product_health_agent.bedrock_provider.boto3.client", fake_client
    )
    provider = BedrockModelProvider.from_config(
        {
            "bedrock": {
                "model_id": "model-id",
                "aws_region": "eu-central-1",
                "api_key": "bedrock-api-key",
                "temperature": 0.2,
                "max_tokens": 123,
            }
        }
    )

    provider._client()

    assert calls == [
        (
            "bedrock-runtime",
            {"region_name": "eu-central-1"},
            "bedrock-api-key",
        )
    ]


def test_bedrock_keeps_tool_input_as_functional_arguments() -> None:
    response = _complete_with_tool_input(
        {
            "query": "Checkout",
            "extra": {"nested": True},
        }
    )

    tool_call = response.tool_calls[0]
    assert tool_call.arguments == {"query": "Checkout", "extra": {"nested": True}}


def test_bedrock_does_not_strip_presentation_like_arguments() -> None:
    response = _complete_with_tool_input(
        {
            "query": "Checkout",
            "presentation": "plain input value",
        }
    )

    assert response.tool_calls[0].arguments == {
        "query": "Checkout",
        "presentation": "plain input value",
    }


def test_bedrock_required_tool_choice_maps_to_any() -> None:
    provider = BedrockModelProvider(model_id="model-id")
    client = StaticClient(_empty_message_response())
    provider.client = client

    provider.complete(
        system_prompt="system",
        messages=[],
        tools=[_tool_definition()],
        tool_choice=ToolChoice.REQUIRED,
    )

    assert client.calls[0]["toolConfig"]["toolChoice"] == {"any": {}}


def test_bedrock_auto_tool_choice_does_not_force_tool() -> None:
    provider = BedrockModelProvider(model_id="model-id")
    client = StaticClient(_empty_message_response())
    provider.client = client

    provider.complete(
        system_prompt="system",
        messages=[],
        tools=[_tool_definition()],
        tool_choice=ToolChoice.AUTO,
    )

    assert "toolChoice" not in client.calls[0]["toolConfig"]


def _complete_with_tool_input(tool_input: dict, text: str = ""):
    provider = BedrockModelProvider(model_id="model-id")
    provider.client = StaticClient(
        {
            "output": {
                "message": {
                    "content": [
                        *([{"text": text}] if text else []),
                        {
                            "toolUse": {
                                "toolUseId": "tool-1",
                                "name": "list_unhealthy_items",
                                "input": tool_input,
                            }
                        },
                    ]
                }
            }
        }
    )

    return provider.complete(system_prompt="system", messages=[], tools=[])


def _empty_message_response() -> dict:
    return {"output": {"message": {"content": []}}}


def _tool_definition() -> ToolDefinition:
    return ToolDefinition(
        name="list_unhealthy_items",
        description="List unhealthy items.",
        input_schema={"type": "object"},
    )
