#!/usr/bin/env python3
"""Unified QA entrypoint for hooks, formatting, secrets scanning, and CI checks."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path
from typing import Callable

PREK_CONFIG = "prek.toml"


def repo_root() -> Path:
    """Return repository root directory based on this script location."""
    return Path(__file__).resolve().parent.parent


def run(cmd: list[str], cwd: Path | None = None) -> int:
    """Run command and return process exit code."""
    result = subprocess.run(cmd, cwd=cwd or repo_root(), check=False)
    return result.returncode


def capture(
    cmd: list[str], cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    """Run command and return captured stdout/stderr."""
    return subprocess.run(
        cmd,
        cwd=cwd or repo_root(),
        check=False,
        capture_output=True,
        text=True,
    )


def capture_json(cmd: list[str], cwd: Path | None = None) -> tuple[int, list[dict]]:
    """Run command and parse JSON list result."""
    result = capture(cmd, cwd)
    if result.returncode != 0:
        return result.returncode, []
    try:
        data = json.loads(result.stdout)
        if isinstance(data, list):
            return 0, data
    except json.JSONDecodeError:
        pass
    return 1, []


def resolve_prek() -> str:
    """Resolve prek executable path or raise RuntimeError."""
    found = shutil.which("prek")
    if found:
        return found

    scripts_dir = Path(sysconfig.get_path("scripts"))
    candidates = [scripts_dir / "prek", scripts_dir / "prek.exe"]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    raise RuntimeError(
        "prek executable not found. Install it via: python -m pip install prek"
    )


def build_emitter(
    out_file: str, append: bool = False
) -> tuple[Callable[[str], None], Callable[[str], None], Callable[[], None]]:
    """Create console/file emitters and closer for streaming output."""
    handle = None
    if out_file:
        out_path = Path(out_file).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        handle = out_path.open(mode, encoding="utf-8")

    def emit(message: str) -> None:
        print(message)
        if handle:
            handle.write(message + "\n")

    def emit_file_only(message: str) -> None:
        if handle:
            handle.write(message + "\n")

    def close() -> None:
        if handle:
            handle.close()

    return emit, emit_file_only, close


def cmd_install_hooks(_: argparse.Namespace) -> int:
    """Install pre-commit and pre-push hooks via prek."""
    prek = resolve_prek()
    return run(
        [prek, "install", "-f", "--hook-type", "pre-commit", "--hook-type", "pre-push"]
    )


def run_check_command(
    *,
    out_file: str = "",
    append_out_file: bool = False,
    suppress_final_summary: bool = False,
) -> int:
    """Run pre-commit checks with compact streaming status output."""
    prek = resolve_prek()
    emit, emit_file_only, close = build_emitter(
        out_file, append=append_out_file
    )
    try:
        check_rc, _, _ = run_hooks_with_compact_output(
            prek, "pre-commit", emit=emit, emit_file_only=emit_file_only
        )
        if not suppress_final_summary:
            emit_final_summary(emit, check_rc == 0)
        return 0 if check_rc == 0 else 1
    finally:
        close()


def cmd_check_code(args: argparse.Namespace) -> int:
    """CLI wrapper for check-code command."""
    return run_check_command(out_file=args.out_file)


def parse_status_from_output(output: str) -> str | None:
    """Extract final hook status from prek textual output."""
    status: str | None = None
    for line in output.splitlines():
        stripped = line.strip()
        match = re.match(r"^(.*?)\.{3,}(Passed|Failed|Skipped|Dry Run)$", stripped)
        if match:
            status = match.group(2)
    return status


def normalize_status(status_raw: str | None, return_code: int, stage: str) -> str:
    """Map raw hook status and exit code to normalized status label."""
    if return_code != 0:
        if stage == "manual":
            return "CHANGED"
        return "FAILED"
    mapping = {
        "Passed": "OK",
        "Skipped": "SKIPPED",
        "Dry Run": "DRY-RUN",
    }
    return mapping.get(status_raw or "", "OK")


def format_status_line(prefix: str, name: str, status: str) -> str:
    """Build standardized single-line status message."""
    return f"{prefix} {name}.. {status}"


def emit_final_summary(emit: Callable[[str], None], ok: bool) -> None:
    """Emit final QA result line."""
    emit(f"=== QA: {'PASSED' if ok else 'FAILED'} ===")


def parse_secrets_summary(output: str) -> tuple[str, int] | None:
    """Parse compact secrets summary line from trufflehog wrapper output."""
    for line in output.splitlines():
        stripped = line.strip()
        ok_match = re.match(r"^OK:\s+(\d+)\s+secrets found$", stripped)
        if ok_match:
            return "OK", int(ok_match.group(1))
        failed_match = re.match(
            r"^FAILED:\s+(\d+)\s+potential secret\(s\) found$", stripped
        )
        if failed_match:
            return "FAILED", int(failed_match.group(1))
    return None


def list_hooks_for_stage(prek: str, stage: str) -> list[dict]:
    """Return hook definitions for the specified prek stage."""
    rc, hooks = capture_json(
        [
            prek,
            "list",
            "--hook-stage",
            stage,
            "--output-format",
            "json",
            "-c",
            PREK_CONFIG,
        ]
    )
    if rc != 0:
        raise RuntimeError(f"Unable to list hooks for stage '{stage}'.")
    return hooks


def run_hooks_with_compact_output(
    prek: str,
    stage: str,
    only_full_ids: set[str] | None = None,
    label_prefix: str = "Checking",
    raw: bool = False,
    emit: Callable[[str], None] | None = None,
    emit_file_only: Callable[[str], None] | None = None,
) -> tuple[int, list[dict], list[str]]:
    """Run hooks one by one and stream concise status lines."""
    if emit is None:
        emit = print
    hooks = list_hooks_for_stage(prek, stage)
    failed: list[dict] = []
    statuses: list[str] = []

    for hook in hooks:
        name = str(hook.get("name") or hook.get("id") or "hook")
        full_id = str(hook.get("full_id") or hook.get("id") or "")
        if not full_id:
            continue
        if only_full_ids is not None and full_id not in only_full_ids:
            continue

        print(f"{label_prefix} {name}.. ", end="", flush=True)
        result = capture(
            [
                prek,
                "run",
                full_id,
                "--all-files",
                "--stage",
                stage,
                "-c",
                PREK_CONFIG,
            ]
        )
        status = normalize_status(
            parse_status_from_output(f"{result.stdout}\n{result.stderr}"),
            result.returncode,
            stage,
        )
        print(status, flush=True)
        status_line = format_status_line(label_prefix, name, status)
        if emit_file_only is not None:
            emit_file_only(status_line)
        else:
            emit(status_line)
        if raw:
            blob = (result.stdout or "") + (result.stderr or "")
            for line in blob.splitlines():
                emit(line)
        statuses.append(status_line)
        if status == "FAILED":
            failed.append(hook)

    return (1 if failed else 0), failed, statuses


def manual_hooks_for_failed_precommit(
    failed_hooks: list[dict], prek: str
) -> tuple[set[str], list[str]]:
    """Map failed check hooks to manual formatter hooks that can fix them."""
    manual_hooks = list_hooks_for_stage(prek, "manual")
    manual_by_id: dict[str, list[dict]] = {}
    for hook in manual_hooks:
        hook_id = str(hook.get("id") or "")
        manual_by_id.setdefault(hook_id, []).append(hook)

    to_run: set[str] = set()
    format_names: list[str] = []
    for hook in failed_hooks:
        hook_id = str(hook.get("id") or "")

        if hook_id in {"google-java-format", "prettier", "ruff-check", "mixed-line-ending"}:
            for candidate in manual_by_id.get(hook_id, []):
                full_id = str(candidate.get("full_id") or "")
                if full_id:
                    to_run.add(full_id)
                    name = str(candidate.get("name") or candidate.get("id") or "hook")
                    if name not in format_names:
                        format_names.append(name)
            continue

        if hook_id == "check-trailing-whitespace":
            for candidate in manual_by_id.get("trailing-whitespace", []):
                full_id = str(candidate.get("full_id") or "")
                if full_id:
                    to_run.add(full_id)
                    name = str(candidate.get("name") or candidate.get("id") or "hook")
                    if name not in format_names:
                        format_names.append(name)
            continue

        if hook_id == "check-final-newline":
            for candidate in manual_by_id.get("end-of-file-fixer", []):
                full_id = str(candidate.get("full_id") or "")
                if full_id:
                    to_run.add(full_id)
                    name = str(candidate.get("name") or candidate.get("id") or "hook")
                    if name not in format_names:
                        format_names.append(name)

    return to_run, format_names


def cmd_format_code(args: argparse.Namespace) -> int:
    """Run check, format failed areas, then re-run full check."""
    prek = resolve_prek()
    emit, emit_file_only, close = build_emitter(args.out_file)
    try:
        check_before_rc, failed_hooks, _ = run_hooks_with_compact_output(
            prek, "pre-commit", emit=emit, emit_file_only=emit_file_only
        )
        if check_before_rc == 0:
            emit_final_summary(emit, True)
            return 0

        if not failed_hooks:
            emit_final_summary(emit, False)
            return 1

        manual_to_run, _ = manual_hooks_for_failed_precommit(failed_hooks, prek)
        if manual_to_run:
            _, _, _ = run_hooks_with_compact_output(
                prek,
                "manual",
                only_full_ids=manual_to_run,
                label_prefix="  Formatting",
                raw=args.raw,
                emit=emit,
                emit_file_only=emit_file_only,
            )

        # After formatting, run full check again to ensure overall consistency.
        check_after_rc, _, _ = run_hooks_with_compact_output(
            prek,
            "pre-commit",
            emit=emit,
            emit_file_only=emit_file_only,
        )
        if check_after_rc == 0:
            emit_final_summary(emit, True)
            return 0

        emit_final_summary(emit, False)
        return 1
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
    """Run secrets scan and print status in the same compact style."""
    script = repo_root() / "tools" / "run_trufflehog.py"
    cmd = [
        sys.executable,
        str(script),
        "--scan-root",
        scan_root,
    ]
    if output_file:
        cmd.extend(["--output-file", output_file])
    if gitignored_output_file:
        cmd.extend(["--gitignored-output-file", gitignored_output_file])
    if binary:
        cmd.extend(["--binary", binary])
    if raw:
        # Keep full trufflehog output for debugging.
        pass
    else:
        cmd.extend(["--summary", "--quiet"])
    emit, emit_file_only, close = build_emitter(
        out_file, append=append_out_file
    )
    print("Checking secrets.. ", end="", flush=True)
    result = capture(cmd)
    try:
        parsed = parse_secrets_summary(result.stdout or "")
        if parsed is not None:
            status = parsed[0]
        else:
            status = "OK" if result.returncode == 0 else "FAILED"
        print(status, flush=True)
        emit_file_only(format_status_line("Checking", "secrets", status))

        if raw:
            if result.stdout:
                for line in result.stdout.splitlines():
                    emit(line)
            if result.stderr:
                for line in result.stderr.splitlines():
                    emit(line)
            if not suppress_final_summary:
                emit_final_summary(emit, result.returncode == 0)
            return result.returncode

        if parsed is not None:
            _, count = parsed
            emit(f"  {count} secrets found")
            # Print details (if any) after the summary header.
            lines = (result.stdout or "").splitlines()
            if len(lines) > 1:
                for line in lines[1:]:
                    if line.strip():
                        emit(f"  {line}")
        else:
            emit("  unable to parse secrets summary")
            if result.stdout:
                for line in result.stdout.splitlines():
                    emit(f"  {line}")
            if result.stderr:
                for line in result.stderr.splitlines():
                    emit(f"  {line}")
        if not suppress_final_summary:
            emit_final_summary(emit, result.returncode == 0)
    finally:
        close()
    return result.returncode


def cmd_check_secrets(args: argparse.Namespace) -> int:
    """CLI wrapper for check-secrets command."""
    return run_secrets_command(
        scan_root=args.scan_root,
        output_file=args.output_file,
        gitignored_output_file=args.gitignored_output_file,
        binary=args.binary,
        raw=args.raw,
        out_file=args.out_file,
    )


def cmd_check_all(args: argparse.Namespace) -> int:
    """Run full QA pipeline: checks plus secrets scan."""
    check_rc = run_check_command(
        out_file=args.out_file,
        append_out_file=False,
        suppress_final_summary=True,
    )
    secrets_rc = run_secrets_command(
        scan_root=args.scan_root,
        output_file=args.output_file,
        gitignored_output_file=args.gitignored_output_file,
        binary=args.binary,
        raw=args.raw,
        out_file=args.out_file,
        append_out_file=True,
        suppress_final_summary=True,
    )
    emit, _, close = build_emitter(args.out_file, append=True)
    try:
        overall_ok = check_rc == 0 and secrets_rc == 0
        emit_final_summary(emit, overall_ok)
    finally:
        close()
    return 0 if check_rc == 0 and secrets_rc == 0 else 1


def cmd_doctor(_: argparse.Namespace) -> int:
    """Validate local toolchain health for QA commands."""
    failed = False

    print(f"[OK] python: {sys.version.split()[0]} ({sys.executable})")
    cfg_path = repo_root() / PREK_CONFIG
    if cfg_path.exists():
        print(f"[OK] config: {PREK_CONFIG}")
    else:
        print(f"[ERR] config: missing {PREK_CONFIG}")
        failed = True

    try:
        prek = resolve_prek()
        prek_ver = capture([prek, "--version"])
        if prek_ver.returncode == 0:
            print(f"[OK] prek: {prek_ver.stdout.strip() or prek_ver.stderr.strip()}")
        else:
            print("[ERR] prek: installed but not runnable")
            failed = True
    except RuntimeError as exc:
        print(f"[ERR] prek: {exc}")
        failed = True

    java_doctor = capture(
        [sys.executable, str(repo_root() / "tools" / "run_google_java_format.py"), "--doctor-json"]
    )
    try:
        java_payload = json.loads(java_doctor.stdout.strip() or "{}")
    except json.JSONDecodeError:
        java_payload = {}
    if java_doctor.returncode == 0 and java_payload.get("ok") is True:
        major = java_payload.get("java_major")
        formatter_version = java_payload.get("formatter_version")
        required = java_payload.get("requires_java_major")
        jar_cached = java_payload.get("jar_cached")
        print(
            f"[OK] java: major {major} (compatible with google-java-format {formatter_version}, requires {required}+, jar cached={jar_cached})"
        )
    else:
        reason = (
            str(java_payload.get("error") or "").strip()
            or java_doctor.stderr.strip()
            or java_doctor.stdout.strip()
            or "unable to resolve Java/google-java-format via tools/run_google_java_format.py"
        )
        print(f"[ERR] java: {reason}")
        failed = True

    trufflehog_doctor = capture(
        [sys.executable, str(repo_root() / "tools" / "run_trufflehog.py"), "--doctor-json"]
    )
    try:
        payload = json.loads(trufflehog_doctor.stdout.strip() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if trufflehog_doctor.returncode == 0 and payload.get("ok") is True:
        version = str(payload.get("version") or "").strip()
        binary = str(payload.get("binary") or "").strip()
        details = f"{version} ({binary})" if version and binary else version or binary
        print(f"[OK] trufflehog: {details}")
    else:
        reason = (
            trufflehog_doctor.stderr.strip()
            or trufflehog_doctor.stdout.strip()
            or "unable to resolve trufflehog via tools/run_trufflehog.py"
        )
        print(f"[ERR] trufflehog: {reason}")
        failed = True

    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    """Build CLI parser for QA command suite."""
    parser = argparse.ArgumentParser(
        description="Cross-platform quality tooling entrypoint."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_install = sub.add_parser("install-hooks", help="Install git hooks via prek.")
    p_install.set_defaults(func=cmd_install_hooks)

    p_check = sub.add_parser("check-code", help="Run check-only code hooks.")
    p_check.add_argument(
        "--out-file",
        default="",
        help="Write command output to this file.",
    )
    p_check.set_defaults(func=cmd_check_code)

    p_format = sub.add_parser("format-code", help="Run code formatting hooks.")
    p_format.add_argument(
        "--raw",
        action="store_true",
        help="Show raw formatter output for manual stage hooks.",
    )
    p_format.add_argument(
        "--out-file",
        default="",
        help="Write command output to this file.",
    )
    p_format.set_defaults(func=cmd_format_code)

    p_sec = sub.add_parser("check-secrets", help="Run trufflehog scan.")
    p_sec.add_argument("--scan-root", default=".")
    p_sec.add_argument("--output-file", default="")
    p_sec.add_argument(
        "--gitignored-output-file", default=""
    )
    p_sec.add_argument("--binary")
    p_sec.add_argument(
        "--raw",
        action="store_true",
        help="Show raw trufflehog JSON output instead of concise summary.",
    )
    p_sec.add_argument(
        "--out-file",
        default="",
        help="Write command output to this file.",
    )
    p_sec.set_defaults(func=cmd_check_secrets)

    p_ci = sub.add_parser("check-all", help="Run check + secrets scan.")
    p_ci.add_argument("--scan-root", default=".")
    p_ci.add_argument("--output-file", default="")
    p_ci.add_argument(
        "--gitignored-output-file", default=""
    )
    p_ci.add_argument("--binary")
    p_ci.add_argument(
        "--raw",
        action="store_true",
        help="Show raw trufflehog JSON output instead of concise summary.",
    )
    p_ci.add_argument(
        "--out-file",
        default="",
        help="Write command output to this file.",
    )
    p_ci.set_defaults(func=cmd_check_all)

    p_doc = sub.add_parser("doctor", help="Show toolchain health and compatibility.")
    p_doc.set_defaults(func=cmd_doctor)

    return parser


def main() -> int:
    """Parse CLI args and dispatch selected QA command."""
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
