"""Module checks for services/dummy-python."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "dummy-python",
    "services/dummy-python",
    code="python_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
