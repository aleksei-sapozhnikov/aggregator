"""Module checks for deploy/kubernetes."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "deploy-kubernetes",
    "deploy/kubernetes",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
