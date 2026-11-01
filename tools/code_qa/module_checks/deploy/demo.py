"""Module checks for deploy/demo."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "deploy-demo",
    "deploy/demo",
    code="python_code",
    tests=TestSpec("unittest_tests", ("--start-directory", ".")),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
