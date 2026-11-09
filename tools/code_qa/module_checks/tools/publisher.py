"""Configure Code QA for Publisher."""

from code_qa.module_checks.specs import (
    ModuleSpec,
    ScopedChecks,
    ScopedTests,
    TestSpec,
)

SPEC = ModuleSpec(
    "publisher",
    "tools/publisher",
    scoped_checks=(
        ScopedChecks(
            "administration",
            "tools/publisher/infra/administration",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
        ScopedChecks(
            "resources",
            "tools/publisher/infra/resources",
            ("tofu-format", "publisher-archive", "tofu-validate", "tflint"),
        ),
    ),
    scoped_tests=(
        ScopedTests(
            "publisher",
            "tools/publisher",
            TestSpec("unittest_tests", ("--start-directory", "tests")),
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
