"""Declare module paths, code profiles, and test tasks for the orchestrator."""

from __future__ import annotations

from dataclasses import dataclass

COMMON_CHECKS = (
    "json",
    "yaml",
    "line-endings",
    "prettier",
)
# Hygiene checks must run after all formatters and language-specific checks.
FINAL_CHECKS = ("trailing-whitespace", "final-newline")
CODE_PROFILES = {
    "common_code": COMMON_CHECKS + FINAL_CHECKS,
    "java_code": COMMON_CHECKS + ("java-format",) + FINAL_CHECKS,
    "python_code": COMMON_CHECKS + ("ruff-lint", "ruff-format") + FINAL_CHECKS,
    "typescript_code": COMMON_CHECKS + ("typescript",) + FINAL_CHECKS,
    "tofu_code": COMMON_CHECKS
    + ("tofu-format", "tofu-validate", "tflint")
    + FINAL_CHECKS,
    "ansible_code": COMMON_CHECKS + ("ansible-lint",) + FINAL_CHECKS,
}


@dataclass(frozen=True)
class TestSpec:
    """Select a test executor and its module-relative CLI parameters."""

    kind: str
    args: tuple[str, ...] = ()
    verbose_args: tuple[str, ...] | None = None


@dataclass(frozen=True)
class ModuleSpec:
    """Configure one module; nested modules own their files independently."""

    name: str
    path: str
    code: str | None = "common_code"
    tests: TestSpec | None = None
    global_checks: tuple[str, ...] = ()

    @property
    def checks(self) -> tuple[str, ...]:
        return CODE_PROFILES[self.code] if self.code else ()


MODULES = (
    ModuleSpec(
        "aggregator", "services/aggregator", "java_code", TestSpec("java_tests")
    ),
    ModuleSpec(
        "aggregator-ui",
        "services/aggregator-ui",
        "typescript_code",
        TestSpec(
            "npm_tests",
            ("--binary", "vitest", "--", "--reporter=dot", "--no-color"),
            ("--binary", "vitest", "--", "--reporter=verbose", "--no-color"),
        ),
    ),
    ModuleSpec("catalog", "services/catalog", tests=TestSpec("go_tests")),
    ModuleSpec(
        "ai-agent",
        "services/ai-agent",
        "python_code",
        TestSpec(
            "pytest_tests",
            (
                "--requirements",
                "src/requirements.txt",
                "--test-directory",
                "tests",
                "--require-import",
                "pytest",
                "--require-import",
                "fastapi",
                "--require-import",
                "httpx",
                "--require-import",
                "boto3",
                "--require-import",
                "lingua",
                "--require-import",
                "requests",
            ),
        ),
    ),
    ModuleSpec("chaos-maker", "services/chaos-maker", "python_code"),
    ModuleSpec("dummy-java", "services/dummy-java", "java_code"),
    ModuleSpec("dummy-javascript", "services/dummy-javascript"),
    ModuleSpec("dummy-python", "services/dummy-python", "python_code"),
    ModuleSpec("grafana", "services/grafana"),
    ModuleSpec("prometheus", "services/prometheus"),
    ModuleSpec(
        "argocd",
        "deploy/argocd",
        "python_code",
        TestSpec("unittest_tests", ("--start-directory", "tests")),
    ),
    ModuleSpec("infra-administration", "infra/administration", "tofu_code"),
    ModuleSpec("infra-state", "infra/state", "tofu_code"),
    ModuleSpec("infra-demo", "infra/demo", "tofu_code"),
    ModuleSpec(
        "infra-demo-ansible",
        "infra/demo/ansible",
        "ansible_code",
        TestSpec("unittest_tests", ("--start-directory", "tests")),
    ),
    ModuleSpec("infra-publication", "deploy/infra/publication", "tofu_code"),
    ModuleSpec(
        "lambda-publisher",
        "deploy/infra/publication/lambda_publisher",
        "python_code",
        TestSpec("unittest_tests", ("--start-directory", "tests")),
    ),
    ModuleSpec(
        "publication-tools",
        "deploy/infra/publication/tools",
        "python_code",
        TestSpec("unittest_tests", ("--start-directory", "tests")),
    ),
    ModuleSpec(
        "code-qa",
        "tools/code_qa",
        "python_code",
        TestSpec(
            "unittest_tests",
            (
                "--start-directory",
                "tests",
                "--top-level-directory",
                "..",
            ),
        ),
    ),
    ModuleSpec("developer-tools", "tools", "python_code"),
    ModuleSpec(
        "repository",
        ".",
        "python_code",
        global_checks=("merge-conflicts", "added-large-files"),
    ),
)
MODULE_BY_NAME = {module.name: module for module in MODULES}
MODULE_NAMES = tuple(MODULE_BY_NAME)
TEST_MODULE_NAMES = tuple(module.name for module in MODULES if module.tests)


def ci_matrix() -> dict[str, list[dict[str, object]]]:
    """Derive CI toolchains from task types rather than module names."""
    return {
        "include": [
            {
                "module": module.name,
                "java": module.code == "java_code"
                or bool(module.tests and module.tests.kind == "java_tests"),
                "go": bool(module.tests and module.tests.kind == "go_tests"),
                "tofu": module.code == "tofu_code",
            }
            for module in MODULES
        ]
    }
