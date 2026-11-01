"""Repository-wide hygiene checks, separate from second-level modules."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "repository",
    ".",
    global_checks=("merge-conflicts", "added-large-files"),
)

if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
