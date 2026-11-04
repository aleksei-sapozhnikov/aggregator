"""Describe second-level repository modules and their specialized inner checks."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_CHECKS = ("json", "yaml", "line-endings", "prettier")
FINAL_CHECKS = ("trailing-whitespace", "final-newline")
TOFU_CHECKS = ("tofu-format", "tofu-validate", "tflint")
CODE_PROFILES = {
    "common_code": DEFAULT_CHECKS + FINAL_CHECKS,
    "java_code": DEFAULT_CHECKS + ("java-format",) + FINAL_CHECKS,
    "python_code": DEFAULT_CHECKS + ("ruff-lint", "ruff-format") + FINAL_CHECKS,
    "typescript_code": DEFAULT_CHECKS + ("typescript",) + FINAL_CHECKS,
    "tofu_code": DEFAULT_CHECKS + TOFU_CHECKS + FINAL_CHECKS,
}


@dataclass(frozen=True)
class TestSpec:
    """Describe a test executor and its directory-relative arguments."""

    kind: str
    args: tuple[str, ...] = ()
    verbose_args: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ScopedChecks:
    """Run specialized checks for a directory owned by the parent module."""

    name: str
    path: str
    checks: tuple[str, ...]


@dataclass(frozen=True)
class ScopedTests:
    """Run an additional test suite owned by the parent module."""

    name: str
    path: str
    tests: TestSpec


@dataclass(frozen=True)
class ModuleSpec:
    """Own one second-level folder, with optional nested checks and suites."""

    name: str
    path: str
    code: str | None = "common_code"
    tests: TestSpec | None = None
    global_checks: tuple[str, ...] = ()
    scoped_checks: tuple[ScopedChecks, ...] = ()
    scoped_tests: tuple[ScopedTests, ...] = ()

    @property
    def checks(self) -> tuple[str, ...]:
        return CODE_PROFILES[self.code] if self.code else ()

    @property
    def has_tests(self) -> bool:
        return self.tests is not None or bool(self.scoped_tests)
