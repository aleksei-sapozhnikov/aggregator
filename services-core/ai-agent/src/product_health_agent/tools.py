"""Tool boundary for retrieving deterministic Product Health facts."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

import requests

from .model_provider import JsonObject, ToolDefinition

logger = logging.getLogger(__name__)


class AgentTool(Protocol):
    """Structured tool available to agent orchestration."""

    @property
    def definition(self) -> ToolDefinition:
        """Return the model-visible tool definition."""

    def execute(self, arguments: JsonObject) -> JsonObject:
        """Execute the tool and return structured facts."""


@dataclass(frozen=True)
class RestProductHealthTools:
    """REST-backed Product Health tools.

    This adapter is intentionally separate from orchestration so it can later be
    replaced by an MCP-backed adapter without changing the agent loop.
    """

    base_url: str
    timeout_seconds: float = 10.0

    def tools(self) -> list[AgentTool]:
        return [
            _SimpleTool(
                definition=ToolDefinition(
                    name="get_product_health",
                    description=(
                        "Get deterministic current health facts for one catalog "
                        "product or service."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Catalog item id or display name.",
                            }
                        },
                        "required": ["query"],
                    },
                ),
                handler=self.get_product_health,
            ),
            _SimpleTool(
                definition=ToolDefinition(
                    name="list_unhealthy_items",
                    description=(
                        "List deterministic current health facts for all non-UP "
                        "catalog items."
                    ),
                    input_schema={
                        "type": "object",
                        "properties": {
                            "presentation": {
                                "type": "object",
                                "description": (
                                    "Localized presentation labels. Every string "
                                    "MUST use the RESPONSE LANGUAGE specified by "
                                    "the agent."
                                ),
                                "properties": {
                                    "header": {
                                        "type": "string",
                                        "description": (
                                            "Short declarative heading in the "
                                            "RESPONSE LANGUAGE. Do not repeat or "
                                            "paraphrase the user's question."
                                        ),
                                    },
                                    "signals_label": {
                                        "type": "string",
                                        "description": (
                                            "Short label for unhealthy signals in "
                                            "the RESPONSE LANGUAGE."
                                        ),
                                    },
                                    "dependencies_label": {
                                        "type": "string",
                                        "description": (
                                            "Short label for affecting "
                                            "dependencies in the RESPONSE LANGUAGE."
                                        ),
                                    },
                                    "healthy_message": {
                                        "type": "string",
                                        "description": (
                                            "Short complete healthy-state message "
                                            "in the RESPONSE LANGUAGE."
                                        ),
                                    },
                                },
                                "required": [
                                    "header",
                                    "signals_label",
                                    "dependencies_label",
                                    "healthy_message",
                                ],
                            }
                        },
                        "required": ["presentation"],
                    },
                ),
                handler=self.list_unhealthy_items,
            ),
        ]

    def get_product_health(self, arguments: JsonObject) -> JsonObject:
        query = str(arguments.get("query", "")).strip()
        try:
            response = requests.get(
                f"{self.base_url}/api/product-health/search",
                params={"query": query},
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            logger.exception(
                "Product Health API request failed. operation=%s base_url=%s "
                "endpoint=%s",
                "get_product_health",
                self.base_url,
                "/api/product-health/search",
            )
            raise RuntimeError("Product Health API is unavailable.") from exc
        return payload if isinstance(payload, dict) else {"found": False}

    def list_unhealthy_items(self, arguments: JsonObject) -> JsonObject:
        try:
            response = requests.get(
                f"{self.base_url}/api/product-health/items",
                params={"unhealthyOnly": "true"},
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            logger.exception(
                "Product Health API request failed. operation=%s base_url=%s "
                "endpoint=%s",
                "list_unhealthy_items",
                self.base_url,
                "/api/product-health/items",
            )
            raise RuntimeError("Product Health API is unavailable.") from exc

        if not isinstance(payload, list):
            raise TypeError("Product Health API returned an unexpected response.")

        if any(not isinstance(entry, dict) for entry in payload):
            raise TypeError("Product Health API returned an unexpected response.")

        return {
            "items": payload,
            "count": len(payload),
        }


@dataclass(frozen=True)
class _SimpleTool:
    definition: ToolDefinition
    handler: Any

    def execute(self, arguments: JsonObject) -> JsonObject:
        return self.handler(arguments)
