"""Module checks for services/dummy-javascript."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "dummy-javascript",
    "services/dummy-javascript",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
