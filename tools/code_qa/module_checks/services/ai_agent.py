"""Module checks for services/ai-agent."""

from code_qa.module_checks.specs import ModuleSpec, TestSpec

SPEC = ModuleSpec(
    "ai-agent",
    "services/ai-agent",
    code="python_code",
    tests=TestSpec(
        "pytest_tests",
        (
            "--requirements",
            "src/requirements.txt",
            "--test-directory",
            "tests",
            "--require-import",
            "pytest",
            "--require-import",
            "fastapi",
            "--require-import",
            "httpx",
            "--require-import",
            "boto3",
            "--require-import",
            "lingua",
            "--require-import",
            "requests",
        ),
    ),
)


if __name__ == "__main__":
    from code_qa.module_checks.runner import run

    raise SystemExit(run(SPEC.name))
