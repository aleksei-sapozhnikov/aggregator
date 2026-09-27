import logging
import os

import pytest
from botocore.exceptions import ReadTimeoutError
from product_health_agent.bedrock_provider import BedrockModelProvider


class TimeoutClient:
    def converse(self, **kwargs):
        raise ReadTimeoutError(endpoint_url="https://bedrock-runtime.example")


class StaticClient:
    def __init__(self, response) -> None:
        self.response = response

    def converse(self, **kwargs):
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

    with caplog.at_level(logging.ERROR), pytest.raises(
        RuntimeError, match="Model provider request failed"
    ) as error:
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
    monkeypatch.setattr("product_health_agent.bedrock_provider.boto3.client", fake_client)
    provider = BedrockModelProvider.from_config(
        {
            "bedrock": {
                "model_id": "amazon.nova-lite-v1:0",
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
    monkeypatch.setattr("product_health_agent.bedrock_provider.boto3.client", fake_client)
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
    monkeypatch.setattr("product_health_agent.bedrock_provider.boto3.client", fake_client)
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


def test_bedrock_reads_presentation_metadata_from_plain_json() -> None:
    response = _complete_with_text(_presentation_json())

    assert response.presentation is not None
    assert response.presentation.header == "Header"
    assert response.presentation.signals_label == "Signals"
    assert response.presentation.dependencies_label == "Dependencies"
    assert response.presentation.healthy_message == "Healthy"


def test_bedrock_reads_presentation_metadata_from_fenced_json() -> None:
    response = _complete_with_text(f"```json\n{_presentation_json()}\n```")

    assert response.presentation is not None
    assert response.presentation.header == "Header"


def test_bedrock_reads_presentation_metadata_from_surrounding_text() -> None:
    response = _complete_with_text(
        f"<thinking>choose the terminal tool</thinking>\n{_presentation_json()}\nDone."
    )

    assert response.presentation is not None
    assert response.presentation.signals_label == "Signals"


def test_bedrock_ignores_malformed_presentation_json() -> None:
    response = _complete_with_text(
        '{"presentation":{"header":"Header","signals_label":"Signals"'
    )

    assert response.presentation is None


def test_bedrock_ignores_missing_presentation_object() -> None:
    response = _complete_with_text('{"header":"Header"}')

    assert response.presentation is None


def test_bedrock_ignores_presentation_with_non_string_fields() -> None:
    response = _complete_with_text(
        '{"presentation":{"header":"Header",'
        '"signals_label":["Signals"],'
        '"dependencies_label":"Dependencies",'
        '"healthy_message":"Healthy"}}'
    )

    assert response.presentation is None


def _complete_with_text(text: str):
    provider = BedrockModelProvider(model_id="model-id")
    provider.client = StaticClient(
        {
            "output": {
                "message": {
                    "content": [
                        {"text": text},
                        {
                            "toolUse": {
                                "toolUseId": "tool-1",
                                "name": "list_unhealthy_items",
                                "input": {},
                            }
                        },
                    ]
                }
            }
        }
    )

    return provider.complete(system_prompt="system", messages=[], tools=[])


def _presentation_json() -> str:
    return (
        '{"presentation":{"header":"Header",'
        '"signals_label":"Signals",'
        '"dependencies_label":"Dependencies",'
        '"healthy_message":"Healthy"}}'
    )
