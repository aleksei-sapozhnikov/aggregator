"""Module checks for tools/code_qa."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "code-qa",
    "tools/code_qa",
    code="python_code",
    tests=TestSpec("unittest_tests",
                   ("--start-directory", "tests", "--top-level-directory", "..")),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
