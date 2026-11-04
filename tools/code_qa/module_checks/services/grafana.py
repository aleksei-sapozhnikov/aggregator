"""Module checks for services/grafana."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "grafana",
    "services/grafana",
    tests=TestSpec("unittest_tests", ("--start-directory", "tests")),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
