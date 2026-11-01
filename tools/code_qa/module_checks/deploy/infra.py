"""Module checks for deploy/infra."""

from code_qa.module_checks.specs import ModuleSpec, ScopedChecks, ScopedTests, TestSpec

SPEC = ModuleSpec(
    "deploy-infra",
    "deploy/infra",
    scoped_checks=(
        ScopedChecks(
            "publication",
            "deploy/infra/publication",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
        ScopedChecks(
            "publication-tools",
            "deploy/infra/publication/tools",
            ("ruff-lint", "ruff-format"),
        ),
    ),
    scoped_tests=(
        ScopedTests(
            "publication-tools",
            "deploy/infra/publication/tools",
            TestSpec("unittest_tests", ("--start-directory", "tests")),
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
