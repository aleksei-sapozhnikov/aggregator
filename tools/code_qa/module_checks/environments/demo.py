"""QA for demo environment deployment, scripts, and OpenTofu."""

from code_qa.module_checks.specs import ModuleSpec, ScopedChecks, TestSpec

SPEC = ModuleSpec(
    "demo",
    "environments/demo",
    code="python_code",
    tests=TestSpec("unittest_tests", ("--start-directory", "tests/python")),
    scoped_checks=(
        ScopedChecks(
            "infra",
            "environments/demo/infra",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
        ScopedChecks("ansible", "environments/demo/ansible", ("ansible-lint",)),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
