#!/usr/bin/env python3
"""Top-level code QA orchestrator."""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from typing import Callable

from utils import (
    build_emitter,
    emit_final_summary,
    parse_secrets_summary,
    repo_root,
    run_script,
    script_dir,
)

@dataclass(frozen=True)
class CheckSpec:
    check_id: str
    display_name: str
    script_name: str
    check_args: list[str]
    format_args: list[str] | None


CHECKS: list[CheckSpec] = [
    CheckSpec(
        check_id="merge-conflicts",
        display_name="merge conflicts",
        script_name="run_merge_conflicts.py",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="added-large-files",
        display_name="added large files",
        script_name="run_added_large_files.py",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="json",
        display_name="json",
        script_name="run_json.py",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="yaml",
        display_name="yaml",
        script_name="run_yaml.py",
        check_args=[],
        format_args=None,
    ),
    CheckSpec(
        check_id="line-endings",
        display_name="line endings",
        script_name="run_line_endings.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="ruff",
        display_name="ruff",
        script_name="run_ruff.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="prettier",
        display_name="prettier",
        script_name="run_prettier.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="trailing-whitespace",
        display_name="trailing whitespace",
        script_name="run_trailing_whitespace.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="final-newline",
        display_name="final newline",
        script_name="run_final_newline.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
    CheckSpec(
        check_id="java-format",
        display_name="java format",
        script_name="run_java_format.py",
        check_args=["--check-only"],
        format_args=["--format"],
    ),
]


def _run_checks(emit: Callable[[str], None]) -> tuple[bool, list[str]]:
    failed: list[str] = []
    for check in CHECKS:
        print(f"Checking {check.display_name}.. ", end="", flush=True)
        ok, details = run_script(check.script_name, check.check_args)
        print("OK" if ok else "FAILED", flush=True)
        if not ok:
            failed.append(check.check_id)
            emit(f"  source: tools/code_qa/{check.script_name}")
            for line in details:
                emit(f"  {line}")
    return len(failed) == 0, failed


def run_check_command(
    *,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    emit, _, close = build_emitter(out_file, append=append_out_file)
    try:
        ok, _ = _run_checks(emit)
        if not suppress_final_summary:
            emit_final_summary(emit, ok)
        return 0 if ok else 1
    finally:
        close()


def run_format_command(
    *,
    raw: bool = False,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    _ = raw
    emit, _, close = build_emitter(out_file, append=append_out_file)
    try:
        ok_before, failed_ids = _run_checks(emit)
        if ok_before:
            if not suppress_final_summary:
                emit_final_summary(emit, True)
            return 0

        by_id: dict[str, CheckSpec] = {check.check_id: check for check in CHECKS}
        for check_id in failed_ids:
            spec = by_id.get(check_id)
            if spec is None or not spec.format_args:
                continue
            print(f"  Formatting {spec.display_name}.. ", end="", flush=True)
            ok, details = run_script(spec.script_name, spec.format_args)
            print("OK" if ok else "FAILED", flush=True)
            for line in details:
                emit(f"  {line}")
            if not ok:
                if not suppress_final_summary:
                    emit_final_summary(emit, False)
                return 1

        ok_after, _ = _run_checks(emit)
        if not suppress_final_summary:
            emit_final_summary(emit, ok_after)
        return 0 if ok_after else 1
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
    script = script_dir() / "run_trufflehog.py"
    cmd = [sys.executable, str(script), "--scan-root", scan_root]
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


def run_check_all_command(
    *,
    scan_root: str = ".",
    output_file: str | None = "",
    gitignored_output_file: str | None = "",
    binary: str | None = None,
    raw: bool = False,
    out_file: str = "",
) -> int:
    check_rc = run_check_command(
        out_file=out_file,
        append_out_file=False,
        suppress_final_summary=True,
    )
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
        emit_final_summary(emit, check_rc == 0 and secrets_rc == 0)
    finally:
        close()
    return 0 if check_rc == 0 and secrets_rc == 0 else 1


def run_qa_command(
    *,
    scan_root: str = ".",
    output_file: str | None = "",
    gitignored_output_file: str | None = "",
    binary: str | None = None,
    raw: bool = False,
    out_file: str = "",
) -> int:
    format_rc = run_format_command(
        raw=raw,
        out_file=out_file,
        append_out_file=False,
        suppress_final_summary=True,
    )
    if format_rc != 0:
        emit, _, close = build_emitter(out_file, append=True)
        try:
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
        emit_final_summary(emit, format_rc == 0 and secrets_rc == 0)
    finally:
        close()
    return 0 if format_rc == 0 and secrets_rc == 0 else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run code QA flows (default: qa)."
    )
    sub = parser.add_subparsers(dest="command")

    qa_cmd = sub.add_parser(
        "qa",
        help="Run format flow, then lint flow (without repeated code checks).",
    )
    qa_cmd.add_argument("--scan-root", default=".")
    qa_cmd.add_argument("--output-file", default="")
    qa_cmd.add_argument("--gitignored-output-file", default="")
    qa_cmd.add_argument("--binary")
    qa_cmd.add_argument("--raw", action="store_true")
    qa_cmd.add_argument("--out-file", default="")

    format_cmd = sub.add_parser("format", help="Run code format flow.")
    format_cmd.add_argument("--raw", action="store_true")
    format_cmd.add_argument("--out-file", default="")

    format_check_only_cmd = sub.add_parser(
        "format-check-only",
        help="Run code checks only (without secrets scan).",
    )
    format_check_only_cmd.add_argument("--out-file", default="")

    lint_cmd = sub.add_parser("lint", help="Run lint flow.")
    lint_cmd.add_argument("--scan-root", default=".")
    lint_cmd.add_argument("--output-file", default="")
    lint_cmd.add_argument("--gitignored-output-file", default="")
    lint_cmd.add_argument("--binary")
    lint_cmd.add_argument("--raw", action="store_true")
    lint_cmd.add_argument("--out-file", default="")

    return parser


def main() -> int:
    args = build_parser().parse_args()

    if args.command == "qa":
        return run_qa_command(
            scan_root=args.scan_root,
            output_file=args.output_file,
            gitignored_output_file=args.gitignored_output_file,
            binary=args.binary,
            raw=args.raw,
            out_file=args.out_file,
        )

    if args.command == "format":
        return run_format_command(raw=args.raw, out_file=args.out_file)

    if args.command == "format-check-only":
        return run_check_command(out_file=args.out_file)

    if args.command == "lint":
        return run_check_all_command(
            scan_root=args.scan_root,
            output_file=args.output_file,
            gitignored_output_file=args.gitignored_output_file,
            binary=args.binary,
            raw=args.raw,
            out_file=args.out_file,
        )

    return run_qa_command()


if __name__ == "__main__":
    raise SystemExit(main())
