"""Run a single module's orchestrated checks and tests."""

from __future__ import annotations


def run(module_name: str) -> int:
    """Dispatch a declared module through the shared QA engine."""
    from code_qa.src.core.cli import run_code_qa_command

    return run_code_qa_command(modules=[module_name])
