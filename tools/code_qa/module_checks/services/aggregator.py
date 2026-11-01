"""Module checks for services/aggregator."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "aggregator",
    "services/aggregator",
    code="java_code",
    tests=TestSpec("java_tests"),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
