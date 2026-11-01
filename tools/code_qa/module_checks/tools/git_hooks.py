"""Module checks for tools/git_hooks."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "git-hooks",
    "tools/git_hooks",
    code="python_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
