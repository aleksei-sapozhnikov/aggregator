import logging
import os

import pytest
from botocore.exceptions import ReadTimeoutError
from product_health_agent.bedrock_provider import BedrockModelProvider


class TimeoutClient:
    def converse(self, **kwargs):
        raise ReadTimeoutError(endpoint_url="https://bedrock-runtime.example")


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
