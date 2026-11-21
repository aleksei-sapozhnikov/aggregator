"""Run the repository-wide secret scan outside individual module checks."""

from __future__ import annotations

import subprocess
import sys

from code_qa.src.core.utils import (
    build_emitter,
    dependency_environment,
    emit_final_summary,
    parse_secrets_summary,
    repo_root,
)


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
    emit("Secrets scan")
    print("  Checking secrets with Trufflehog.. ", end="", flush=True)
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
        emit_file_only(f"  Checking secrets with Trufflehog.. {status}")
        if parsed:
            for line in (result.stdout or "").splitlines():
                if line.startswith("Scan scope: "):
                    emit(f"  {line}")
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
