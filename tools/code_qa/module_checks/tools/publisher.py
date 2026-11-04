"""Configure Code QA for Publisher only; Publisher Legacy is excluded."""

from code_qa.module_checks.specs import ModuleSpec, ScopedTests, TestSpec

SPEC = ModuleSpec(
    "publisher",
    "tools/publisher",
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
