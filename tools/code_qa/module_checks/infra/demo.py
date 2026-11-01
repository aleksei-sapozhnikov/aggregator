"""Module checks for infra/demo."""

from code_qa.module_checks.specs import ModuleSpec, ScopedChecks, ScopedTests, TestSpec

SPEC = ModuleSpec(
    "infra-demo",
    "infra/demo",
    code="tofu_code",
    scoped_checks=(
        ScopedChecks("ansible", "infra/demo/ansible", ("ansible-lint",)),
    ),
    scoped_tests=(
        ScopedTests(
            "ansible",
            "infra/demo/ansible",
            TestSpec("unittest_tests", ("--start-directory", "tests")),
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
