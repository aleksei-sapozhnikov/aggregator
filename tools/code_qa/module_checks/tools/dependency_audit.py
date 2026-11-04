"""Module checks for tools/dependency_audit."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "dependency-audit",
    "tools/dependency_audit",
    code="python_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
