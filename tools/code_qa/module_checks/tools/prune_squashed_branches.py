"""Module checks for tools/prune_squashed_branches."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "prune-squashed-branches",
    "tools/prune_squashed_branches",
    code="python_code",
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
