"""Discover declarative second-level QA modules in a stable order."""

from __future__ import annotations

from importlib import import_module

from code_qa.module_checks.specs import (
    CODE_PROFILES,
    DEFAULT_CHECKS,
    FINAL_CHECKS,
    ModuleSpec,
    ScopedChecks,
    ScopedTests,
    TestSpec,
)

MODULE_IMPORTS = (
    "code_qa.module_checks.services.aggregator",
    "code_qa.module_checks.services.aggregator_ui",
    "code_qa.module_checks.services.ai_agent",
    "code_qa.module_checks.services.catalog",
    "code_qa.module_checks.services.chaos_maker",
    "code_qa.module_checks.services.dummy_java",
    "code_qa.module_checks.services.dummy_javascript",
    "code_qa.module_checks.services.dummy_python",
    "code_qa.module_checks.services.grafana",
    "code_qa.module_checks.services.prometheus",
    "code_qa.module_checks.deploy.argocd",
    "code_qa.module_checks.deploy.compose",
    "code_qa.module_checks.deploy.demo",
    "code_qa.module_checks.deploy.infra",
    "code_qa.module_checks.deploy.kubernetes",
    "code_qa.module_checks.infra.administration",
    "code_qa.module_checks.infra.demo",
    "code_qa.module_checks.infra.state",
    "code_qa.module_checks.tools.code_qa",
    "code_qa.module_checks.tools.dependency_audit",
    "code_qa.module_checks.tools.git_hooks",
    "code_qa.module_checks.tools.lambda_publisher",
    "code_qa.module_checks.tools.prune_squashed_branches",
)

MODULES = tuple(import_module(path).SPEC for path in MODULE_IMPORTS) + (
    import_module("code_qa.module_checks.common.repository").SPEC,
)
MODULE_BY_NAME = {module.name: module for module in MODULES}
MODULE_NAMES = tuple(MODULE_BY_NAME)
TEST_MODULE_NAMES = tuple(module.name for module in MODULES if module.has_tests)


def ci_matrix() -> dict[str, list[dict[str, object]]]:
    """Select CI toolchains from modules and their specialized checks."""
    return {
        "include": [
            {
                "module": module.name,
                "java": module.code == "java_code"
                or bool(module.tests and module.tests.kind == "java_tests"),
                "go": bool(module.tests and module.tests.kind == "go_tests"),
                "tofu": module.code == "tofu_code"
                or any(
                    "tofu-validate" in group.checks
                    for group in module.scoped_checks
                ),
            }
            for module in MODULES
        ]
    }
