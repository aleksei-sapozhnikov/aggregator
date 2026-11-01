"""Module checks for services/chaos-maker."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "chaos-maker",
    "services/chaos-maker",
    code="python_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
