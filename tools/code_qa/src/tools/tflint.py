"""Resolve the pinned TFLint binary."""

from pathlib import Path

from code_qa.src.tools.infra_common import Tool, resolve_tool

TFLINT = Tool(
    name="tflint",
    version="0.65.0",
    repository="terraform-linters/tflint",
    checksums="checksums.txt",
    asset_prefix="tflint",
    version_prefix="TFLint version ",
    unsupported_platform=("windows", "arm64"),
)


def resolve(root: Path | None = None) -> str | None:
    """Use the pinned local or installed TFLint binary."""
    return resolve_tool(TFLINT, root)
