"""Repository-wide hygiene checks, separate from second-level modules."""

from code_qa.module_checks.specs import ModuleSpec

SPEC = ModuleSpec(
    "repository",
    ".",
    global_checks=("merge-conflicts", "added-large-files"),
)
