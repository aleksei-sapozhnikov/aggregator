"""Module checks for services/dummy-java."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "dummy-java",
    "services/dummy-java",
    code="java_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
