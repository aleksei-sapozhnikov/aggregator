"""Module checks for services/prometheus."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "prometheus",
    "services/prometheus",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
