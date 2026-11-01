"""Module checks for tools/lambda_publisher."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "lambda-publisher",
    "tools/lambda_publisher",
    code="python_code",
    tests=TestSpec("unittest_tests", ("--start-directory", "tests/lambda_publisher")),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
