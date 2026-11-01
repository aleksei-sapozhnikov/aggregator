"""Module checks for infra/administration."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "infra-administration",
    "infra/administration",
    code="tofu_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
