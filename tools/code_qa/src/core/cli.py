"""Top-level code QA orchestrator."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, replace
from pathlib import Path

from code_qa.src.core.inputs import files_in_module
from code_qa.src.core.modules import (
    MODULE_BY_NAME,
    MODULE_NAMES,
    MODULES,
    TEST_MODULE_NAMES,
    ModuleSpec,
    ci_matrix,
)
from code_qa.src.core.utils import (
    build_emitter,
    dependency_environment,
    emit_final_summary,
    iter_repo_files,
    parse_secrets_summary,
    repo_root,
    run_module,
    runtime_dir,
    scoped_paths,
)


@dataclass(frozen=True)
class CheckSpec:
    """Describe one QA check and its optional format action."""

    check_id: str
    display_name: str
    runner: str
    check_args: list[str]
    format_args: list[str] | None
    module: str | None = None
    global_scope: bool = False
    input_kind: str = "files"


CHECK_TEMPLATES: list[CheckSpec] = [
    CheckSpec(
        check_id="merge-conflicts",
        display_name="merge conflicts",
        runner="code_qa.src.checks.other.merge_conflicts",
        check_args=[],
        format_args=None,
        global_scope=True,
    ),
    CheckSpec(
        check_id="added-large-files",
        display_name="added large files",
        runner="code_qa.src.checks.other.added_large_files",
        check_args=[],
        format_args=None,
        global_scope=True,
    ),
    CheckSpec(
        check_id="json",
        display_name="json",
        runner="code_qa.src.checks.other.json_files",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="yaml",
        display_name="yaml",
        runner="code_qa.src.checks.other.yaml_files",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="line-endings",
        display_name="line endings",
        runner="code_qa.src.checks.other.line_endings",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="ruff-lint",
        display_name="ruff lint",
        runner="code_qa.src.checks.format.ruff",
        check_args=["--lint-check-only"],
        format_args=["--lint-fix"],
    ),
    CheckSpec(
        check_id="ruff-format",
        display_name="ruff formatting",
        runner="code_qa.src.checks.format.ruff",
        check_args=["--format-check-only"],
        format_args=["--format-fix"],
    ),
    CheckSpec(
        check_id="prettier",
        display_name="prettier",
        runner="code_qa.src.checks.format.prettier",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="typescript",
        display_name="typescript",
        runner="code_qa.src.checks.format.typescript",
        check_args=[],
        format_args=None,
        input_kind="project",
    ),
    CheckSpec(
        check_id="trailing-whitespace",
        display_name="trailing whitespace",
        runner="code_qa.src.checks.other.trailing_whitespace",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="final-newline",
        display_name="final newline",
        runner="code_qa.src.checks.other.final_newline",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="java-format",
        display_name="java format",
        runner="code_qa.src.checks.format.java_format",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        "tofu-format",
        "OpenTofu formatting",
        "code_qa.src.checks.format.tofu",
        ["--check-only"],
        ["--format"],
        input_kind="project",
    ),
    CheckSpec(
        "tofu-validate",
        "OpenTofu validation",
        "code_qa.src.checks.format.tofu",
        ["--validate"],
        None,
        input_kind="project",
    ),
    CheckSpec(
        "tflint",
        "TFLint",
        "code_qa.src.checks.format.tflint",
        ["--lint"],
        None,
        input_kind="project",
    ),
]


def module_checks() -> list[CheckSpec]:
    """Bind adapters to explicit modules, keeping repository hygiene in its own group."""
    templates = {check.check_id: check for check in CHECK_TEMPLATES}
    checks = []
    for module in MODULES:
        for check_id in module.global_checks + module.checks:
            spec = templates[check_id]
            checks.append(
                replace(
                    spec,
                    check_id=f"{module.name}/{check_id}",
                    module=module.name,
                )
            )
    return checks


CHECKS = module_checks()


def selected_checks(modules: list[str] | None) -> list[CheckSpec]:
    """Keep registry order and avoid repeating checks for duplicate selections."""
    return [check for check in CHECKS if modules is None or check.module in modules]


def execute_check(
    spec: CheckSpec,
    args: list[str],
    root: Path | None = None,
    paths: list[Path] | None = None,
    *,
    scoped: bool = False,
) -> tuple[bool, list[str]]:
    """Pass the chosen module's paths; checks decide which file types matter."""
    root = root or repo_root()
    paths = paths if paths is not None else iter_repo_files(root)
    if spec.module is not None and not spec.global_scope:
        paths = files_in_module(root, spec.module, paths)
    else:
        paths = [
            path for path in paths if path.resolve().is_relative_to(root.resolve())
        ]

    if spec.input_kind == "project":
        assert spec.module is not None
        directory = root / MODULE_BY_NAME[spec.module].path
        parameters = [
            *args,
            "--directory",
            str(directory),
            "--workspace-root",
            str(root),
        ]
        if scoped:
            return _run_with_manifest(
                spec.runner, [*parameters, "--changed-files-from"], root, paths
            )
        return run_module(spec.runner, parameters)

    files = [path for path in paths if path.is_file()]
    if not files:
        return True, []
    return _run_with_manifest(
        spec.runner, [*args, "--root", str(root), "--files-from"], root, files
    )


def _run_with_manifest(
    runner: str, args: list[str], root: Path, paths: list[Path]
) -> tuple[bool, list[str]]:
    """Write explicit module-relative paths for one synchronous check process."""
    runtime_dir(root).mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="check-inputs-", dir=runtime_dir(root)
    ) as temporary:
        manifest = Path(temporary) / "files.json"
        manifest.write_text(
            json.dumps([path.relative_to(root).as_posix() for path in paths]),
            encoding="utf-8",
        )
        return run_module(runner, [*args, str(manifest)])


def _run_checks(
    emit: Callable[[str], None],
    modules: list[str] | None = None,
    *,
    show_module: bool = True,
) -> tuple[bool, list[str]]:
    """Run all configured checks and emit details for failures."""
    failed: list[str] = []
    missing: set[str] = set()
    previous_module = None
    has_output = False
    root = repo_root()
    changed = scoped_paths(root)
    paths = changed if changed is not None else iter_repo_files(root)
    for check in selected_checks(modules):
        if check.module != previous_module:
            if check.module is not None:
                if show_module:
                    if has_output:
                        emit("")
                    emit(f"Module: {check.module}")
                    has_output = True
                directory = root / MODULE_BY_NAME[check.module].path
                if not directory.is_dir():
                    emit(f"  Missing module directory: {directory}")
                    failed.append(check.check_id)
                    missing.add(check.module)
            previous_module = check.module
        if check.module in missing:
            continue
        print(f"  Checking {check.display_name}.. ", end="", flush=True)
        has_output = True
        ok, details = execute_check(
            check, check.check_args, root, paths, scoped=changed is not None
        )
        print("OK" if ok else "FAILED", flush=True)
        if not ok:
            failed.append(check.check_id)
            emit(f"  source: {check.runner}")
            for line in details:
                emit(f"  {line}")
    return len(failed) == 0, failed


def run_check_command(
    *,
    modules: list[str] | None = None,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    """Execute check-only flow and return process exit code."""
    emit, _, close = build_emitter(out_file, append=append_out_file)
    try:
        ok, _ = _run_checks(emit, modules)
        if not suppress_final_summary:
            emit_final_summary(emit, ok)
        return 0 if ok else 1
    finally:
        close()


def run_format_command(
    *,
    modules: list[str] | None = None,
    raw: bool = False,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    """Format and verify one selected module at a time."""
    _ = raw
    emit, _, close = build_emitter(out_file, append=append_out_file)
    try:
        # Fix exactly the inputs used by scoped checks. Project-wide formatters
        # (such as recursive OpenTofu fmt) receive the same scope manifest and
        # deliberately operate on their entire root when triggered.
        root = repo_root()
        changed = scoped_paths(root)
        paths = changed if changed is not None else iter_repo_files(root)
        checks = selected_checks(modules)
        by_id = {check.check_id: check for check in checks}
        module_names = list(
            dict.fromkeys(check.module for check in checks if check.module is not None)
        )
        passed = True

        for index, module in enumerate(module_names):
            if index:
                emit("")
            ok_before, failed_ids = _run_checks(emit, [module])
            if ok_before:
                continue

            format_failed = False
            for check_id in failed_ids:
                spec = by_id.get(check_id)
                if spec is None or not spec.format_args:
                    continue
                print(
                    f"  Fixing {spec.module}: {spec.display_name}.. ",
                    end="",
                    flush=True,
                )
                ok, details = execute_check(
                    spec, spec.format_args, root, paths, scoped=changed is not None
                )
                print("OK" if ok else "FAILED", flush=True)
                for line in details:
                    emit(f"  {line}")
                if not ok:
                    format_failed = True

            emit(f"  Rechecking all checks for {module}...")
            ok_after, _ = _run_checks(emit, [module], show_module=False)
            if not ok_after or format_failed:
                passed = False
                break

        if not suppress_final_summary:
            emit_final_summary(emit, passed)
        return 0 if passed else 1
    finally:
        close()


def run_secrets_command(
    *,
    scan_root: str,
    output_file: str | None,
    gitignored_output_file: str | None,
    binary: str | None,
    raw: bool,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    """Execute secrets scan flow and report summarized status."""
    cmd = [
        sys.executable,
        "-m",
        "code_qa.src.checks.other.trufflehog",
        "--scan-root",
        scan_root,
    ]
    if output_file:
        cmd.extend(["--output-file", output_file])
    if gitignored_output_file:
        cmd.extend(["--gitignored-output-file", gitignored_output_file])
    if binary:
        cmd.extend(["--binary", binary])
    if not raw:
        cmd.extend(["--summary", "--quiet"])

    emit, emit_file_only, close = build_emitter(out_file, append=append_out_file)
    print("Checking secrets with Trufflehog.. ", end="", flush=True)
    result = subprocess.run(
        cmd,
        cwd=repo_root(),
        env=dependency_environment(),
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        parsed = parse_secrets_summary(result.stdout or "")
        status = parsed[0] if parsed else ("OK" if result.returncode == 0 else "FAILED")
        print(status, flush=True)
        emit_file_only(f"Checking secrets with Trufflehog.. {status}")
        if parsed:
            emit(f"  {parsed[1]} secrets found")
        else:
            for line in (result.stdout or "").splitlines():
                if line.strip():
                    emit(f"  {line}")
            for line in (result.stderr or "").splitlines():
                if line.strip():
                    emit(f"  {line}")

        if not suppress_final_summary:
            emit_final_summary(emit, result.returncode == 0)
    finally:
        close()
    return result.returncode


def readable_test_line(line: str) -> str:
    """Render test status symbols as plain ASCII in redirected Windows logs."""
    return line.replace("✓", "PASS").replace("✗", "FAIL").replace("❯", ">")


TEST_EXECUTORS = {
    "java_tests": "code_qa.src.checks.tests.java_tests",
    "npm_tests": "code_qa.src.checks.tests.npm_tests",
    "go_tests": "code_qa.src.checks.tests.go_tests",
    "pytest_tests": "code_qa.src.checks.tests.pytest_tests",
    "unittest_tests": "code_qa.src.checks.tests.unittest_tests",
}


def test_command(module: ModuleSpec, root: Path, *, verbose: bool = False) -> list[str]:
    """Bind a configured test type to explicit paths and parameters."""
    assert module.tests is not None
    parameters = (
        module.tests.verbose_args
        if verbose and module.tests.verbose_args is not None
        else module.tests.args
    )
    return [
        sys.executable,
        "-u",
        "-m",
        TEST_EXECUTORS[module.tests.kind],
        "--directory",
        str(root / module.path),
        "--workspace-root",
        str(root),
        *(["--verbose"] if verbose else []),
        *parameters,
    ]


def execute_test(
    command: list[str], emit: Callable[[str], None], *, verbose: bool
) -> tuple[int, list[str]]:
    """Stream verbose output and retain complete diagnostics for compact failures."""
    details = []
    environment = dependency_environment()
    environment["PYTHONIOENCODING"] = "utf-8"
    try:
        with subprocess.Popen(
            command,
            cwd=repo_root(),
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        ) as process:
            assert process.stdout is not None
            for line in process.stdout:
                text = readable_test_line(line.rstrip("\r\n"))
                if verbose:
                    emit(text)
                else:
                    details.append(text)
            return process.wait(), details
    except OSError as error:
        return 1, [f"Unable to start test command: {error}"]


def run_test_command(
    *,
    modules: list[str] | None = None,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
    verbose: bool = False,
) -> int:
    """Run module tests with compact output unless verbose is requested."""
    emit, _, close = build_emitter(out_file, append=append_out_file)
    try:
        failed = []
        root = repo_root()
        for name in dict.fromkeys(
            modules if modules is not None else TEST_MODULE_NAMES
        ):
            module = MODULE_BY_NAME[name]
            if module.tests is None:
                continue
            if not (root / module.path).is_dir():
                emit(
                    f"Testing {name}.. FAILED (missing directory: {root / module.path})"
                )
                failed.append(name)
                continue
            command = test_command(module, root, verbose=verbose)
            if verbose:
                emit(f"Testing {name}...")
                emit(f"  command: {' '.join(command)}")
            status, details = execute_test(command, emit, verbose=verbose)
            emit(f"Testing {name}.. {'OK' if status == 0 else 'FAILED'}")
            if status != 0:
                failed.append(name)
                if not verbose:
                    emit(f"  command: {' '.join(command)}")
                for line in details:
                    emit(line)
        emit(f"=== TESTS: {'FAILED' if failed else 'PASSED'} ===")
        if failed:
            emit(f"Failed modules: {', '.join(failed)}")
        if not suppress_final_summary:
            emit_final_summary(emit, not failed)
        return 1 if failed else 0
    finally:
        close()


def run_code_qa_command(
    *,
    modules: list[str] | None = None,
    raw: bool = False,
    out_file: str = "",
    suppress_final_summary: bool = False,
) -> int:
    """Check code and run module tests without modifying source files."""
    _ = raw
    check_rc = run_check_command(
        modules=modules,
        out_file=out_file,
        append_out_file=False,
        suppress_final_summary=True,
    )
    if check_rc != 0:
        emit, _, close = build_emitter(out_file, append=True)
        try:
            if not suppress_final_summary:
                emit_final_summary(emit, False)
        finally:
            close()
        return 1

    test_modules = [
        name
        for name in (modules if modules is not None else TEST_MODULE_NAMES)
        if MODULE_BY_NAME[name].tests
    ]
    if not test_modules:
        emit, _, close = build_emitter(out_file, append=True)
        try:
            emit("No unit test suite is registered for the selected modules.")
            if not suppress_final_summary:
                emit_final_summary(emit, True)
        finally:
            close()
        return 0

    return run_test_command(
        modules=test_modules,
        out_file=out_file,
        append_out_file=True,
        suppress_final_summary=suppress_final_summary,
    )


def run_qa_command(
    *,
    modules: list[str] | None = None,
    scan_root: str = ".",
    output_file: str | None = "",
    gitignored_output_file: str | None = "",
    binary: str | None = None,
    raw: bool = False,
    out_file: str = "",
) -> int:
    """Check code without fixes, run tests, and then scan secrets."""
    code_qa_rc = run_code_qa_command(
        modules=modules,
        raw=raw,
        out_file=out_file,
        suppress_final_summary=True,
    )
    if code_qa_rc != 0:
        emit, _, close = build_emitter(out_file, append=True)
        try:
            emit("Skipping secrets scan: code checks or tests failed.")
            emit_final_summary(emit, False)
        finally:
            close()
        return 1

    secrets_rc = run_secrets_command(
        scan_root=scan_root,
        output_file=output_file,
        gitignored_output_file=gitignored_output_file,
        binary=binary,
        raw=raw,
        out_file=out_file,
        append_out_file=True,
        suppress_final_summary=True,
    )
    emit, _, close = build_emitter(out_file, append=True)
    try:
        emit_final_summary(emit, secrets_rc == 0)
    finally:
        close()
    return 0 if secrets_rc == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for QA subcommands."""
    parser = argparse.ArgumentParser(description="Run code QA flows (default: qa).")
    sub = parser.add_subparsers(dest="command")

    qa_cmd = sub.add_parser(
        "qa",
        help="Check code, run tests, and scan secrets without modifying files.",
    )
    qa_cmd.add_argument("--scan-root", default=".")
    qa_cmd.add_argument("--output-file", default="")
    qa_cmd.add_argument("--gitignored-output-file", default="")
    qa_cmd.add_argument("--binary")
    qa_cmd.add_argument("--raw", action="store_true")
    qa_cmd.add_argument("--out-file", default="")

    code_qa_cmd = sub.add_parser(
        "code-qa",
        help="Check code and run module tests without fixes or secrets scanning.",
    )
    code_qa_cmd.add_argument("--raw", action="store_true")
    code_qa_cmd.add_argument("--out-file", default="")

    test_cmd = sub.add_parser("test", help="Run unit tests by module.")
    test_cmd.add_argument(
        "--module",
        action="append",
        choices=TEST_MODULE_NAMES,
    )
    test_cmd.add_argument("--out-file", default="")
    test_cmd.add_argument(
        "--verbose", action="store_true", help="Show output from every test module."
    )

    secrets_cmd = sub.add_parser(
        "secrets", help="Run only the TruffleHog secrets scan."
    )
    secrets_cmd.add_argument("--scan-root", default=".")
    secrets_cmd.add_argument("--output-file", default="")
    secrets_cmd.add_argument("--gitignored-output-file", default="")
    secrets_cmd.add_argument("--binary")
    secrets_cmd.add_argument("--raw", action="store_true")
    secrets_cmd.add_argument("--out-file", default="")

    format_cmd = sub.add_parser("format", help="Run code format flow.")
    format_cmd.add_argument("--raw", action="store_true")
    format_cmd.add_argument("--out-file", default="")

    format_check_only_cmd = sub.add_parser(
        "format-check-only",
        help="Run code checks only (without secrets scan).",
    )
    format_check_only_cmd.add_argument("--out-file", default="")

    lint_cmd = sub.add_parser("lint", help="Run code checks without secrets scanning.")
    lint_cmd.add_argument("--out-file", default="")

    for command in (qa_cmd, code_qa_cmd, format_cmd, format_check_only_cmd, lint_cmd):
        command.add_argument(
            "--module",
            action="append",
            choices=MODULE_NAMES,
            help="Check only this module (may be repeated); secrets remain repository-wide.",
        )
    modules_cmd = sub.add_parser(
        "modules", help="List module names or emit the CI matrix."
    )
    modules_cmd.add_argument("--json", action="store_true")

    return parser


def configure_redirected_stdout() -> None:
    """Use UTF-8 for redirected logs instead of a Windows ANSI code page."""
    stdout = sys.stdout
    if stdout is None or stdout.isatty():
        return

    reconfigure = getattr(stdout, "reconfigure", None)
    if callable(reconfigure):
        reconfigure(encoding="utf-8", errors="backslashreplace")


def main() -> int:
    """Dispatch CLI command to the matching QA workflow."""
    configure_redirected_stdout()
    args = build_parser().parse_args()

    if args.command == "qa":
        return run_qa_command(
            modules=args.module,
            scan_root=args.scan_root,
            output_file=args.output_file,
            gitignored_output_file=args.gitignored_output_file,
            binary=args.binary,
            raw=args.raw,
            out_file=args.out_file,
        )

    if args.command == "code-qa":
        return run_code_qa_command(
            modules=args.module, raw=args.raw, out_file=args.out_file
        )

    if args.command == "test":
        return run_test_command(
            modules=args.module, out_file=args.out_file, verbose=args.verbose
        )

    if args.command == "secrets":
        return run_secrets_command(
            scan_root=args.scan_root,
            output_file=args.output_file,
            gitignored_output_file=args.gitignored_output_file,
            binary=args.binary,
            raw=args.raw,
            out_file=args.out_file,
        )

    if args.command == "format":
        return run_format_command(
            modules=args.module, raw=args.raw, out_file=args.out_file
        )

    if args.command == "format-check-only":
        return run_check_command(modules=args.module, out_file=args.out_file)

    if args.command == "lint":
        return run_check_command(modules=args.module, out_file=args.out_file)

    if args.command == "modules":
        print(json.dumps(ci_matrix()) if args.json else "\n".join(MODULE_NAMES))
        return 0

    return run_qa_command()


if __name__ == "__main__":
    raise SystemExit(main())
