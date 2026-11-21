"""Module checks for services/aggregator-ui."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "aggregator-ui",
    "services/aggregator-ui",
    code="typescript_code",
    tests=TestSpec(
        "npm_tests",
        ("--binary", "vitest", "--", "--reporter=dot", "--no-color"),
        ("--binary", "vitest", "--", "--reporter=verbose", "--no-color"),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
