"""Configure publisher infrastructure, operator tools, and Lambda tests."""

from code_qa.module_checks.specs import ModuleSpec, ScopedChecks, ScopedTests, TestSpec

SPEC = ModuleSpec(
    "publisher",
    "tools/publisher",
    scoped_checks=(
        ScopedChecks(
            "infra",
            "tools/publisher/infra",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
        ScopedChecks(
            "infra-tools",
            "tools/publisher/infra/tools",
            ("ruff-lint", "ruff-format"),
        ),
        ScopedChecks(
            "lambda_publisher",
            "tools/publisher/lambda_publisher",
            ("ruff-lint", "ruff-format"),
        ),
    ),
    scoped_tests=(
        ScopedTests(
            "infra-tools",
            "tools/publisher/infra/tools",
            TestSpec("unittest_tests", ("--start-directory", "tests")),
        ),
        ScopedTests(
            "lambda_publisher",
            "tools/publisher/lambda_publisher",
            TestSpec("unittest_tests", ("--start-directory", "tests/lambda_publisher")),
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
