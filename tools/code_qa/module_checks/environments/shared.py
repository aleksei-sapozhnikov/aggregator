"""QA for shared AWS infrastructure and state ownership."""

from code_qa.module_checks.specs import ModuleSpec, ScopedChecks

SPEC = ModuleSpec(
    "shared",
    "environments/shared",
    scoped_checks=(
        ScopedChecks(
            "administration",
            "environments/shared/infra/administration",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
        ScopedChecks(
            "state",
            "environments/shared/infra/state",
            ("tofu-format", "tofu-validate", "tflint"),
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
