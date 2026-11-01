"""Repository-wide secret scanning is managed separately from module QA."""

from __future__ import annotations


def run(**options: object) -> int:
    """Use the existing TruffleHog command without registering a module."""
    from code_qa.src.core.cli import run_secrets_command

    return run_secrets_command(**options)
