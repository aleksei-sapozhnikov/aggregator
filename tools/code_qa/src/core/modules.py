"""Compatibility imports for the module_checks registry."""

from code_qa.module_checks.registry import (
    CODE_PROFILES,
    FINAL_CHECKS,
    MODULE_BY_NAME,
    MODULE_NAMES,
    MODULES,
    TEST_MODULE_NAMES,
    ModuleSpec,
    ScopedChecks,
    ScopedTests,
    TestSpec,
    ci_matrix,
)
from code_qa.module_checks.registry import (
    DEFAULT_CHECKS as COMMON_CHECKS,
)

__all__ = (
    "CODE_PROFILES",
    "COMMON_CHECKS",
    "FINAL_CHECKS",
    "MODULES",
    "MODULE_BY_NAME",
    "MODULE_NAMES",
    "TEST_MODULE_NAMES",
    "ModuleSpec",
    "ScopedChecks",
    "ScopedTests",
    "TestSpec",
    "ci_matrix",
)
