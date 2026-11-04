"""Resolve the pinned OpenTofu binary."""

from pathlib import Path

from code_qa.src.tools.infra_common import Tool, resolve_tool

TOFU = Tool(
    name="tofu",
    version="1.13.1",
    repository="opentofu/opentofu",
    checksums="tofu_1.13.1_SHA256SUMS",
    asset_prefix="tofu_1.13.1",
    version_prefix="OpenTofu v",
)


def resolve(root: Path | None = None) -> str | None:
    """Use the pinned local or installed OpenTofu binary."""
    return resolve_tool(TOFU, root)
