#!/usr/bin/env python3
"""Run trufflehog filesystem scan with explicit paths and concise summary support."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

TRUFFLEHOG_VERSION = "3.94.0"
TRUFFLEHOG_RELEASE_BASE_URL = (
    f"https://github.com/trufflesecurity/trufflehog/releases/download/v{TRUFFLEHOG_VERSION}"
)


def parse_args() -> argparse.Namespace:
    """Parse explicit scan paths and output settings for trufflehog run."""
    parser = argparse.ArgumentParser(
        description="Run trufflehog filesystem scan with gitignored exclusions."
    )
    parser.add_argument("--scan-root", default=".", help="Root folder to scan.")
    parser.add_argument(
        "--output-file",
        default="",
        help="Where to save scanner JSON output.",
    )
    parser.add_argument(
        "--gitignored-output-file",
        default="",
        help="Where to save collected gitignored items.",
    )
    parser.add_argument("--binary", help="Explicit path to trufflehog binary.")
    parser.add_argument(
        "--doctor-json",
        action="store_true",
        help="Print binary/version status as JSON and exit.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print concise human-readable scan summary.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress raw trufflehog stdout/stderr output.",
    )
    return parser.parse_args()


def run_command(
    args: list[str], cwd: Path | None = None
) -> subprocess.CompletedProcess[str]:
    """Run command and return captured text output."""
    try:
        return subprocess.run(
            args, cwd=cwd, text=True, capture_output=True, check=False
        )
    except OSError as exc:
        return subprocess.CompletedProcess(
            args=args, returncode=1, stdout="", stderr=str(exc)
        )


def can_run_trufflehog(binary: str) -> bool:
    """Check whether binary is runnable and responds to --version."""
    return run_command([binary, "--version"]).returncode == 0


def find_repo_root(scan_root: Path) -> Path:
    """Resolve git repository root for the scan target."""
    result = run_command(["git", "-C", str(scan_root), "rev-parse", "--show-toplevel"])
    if result.returncode == 0:
        return Path(result.stdout.strip()).resolve()
    return scan_root.resolve()


def collect_gitignored(repo_root: Path) -> tuple[list[dict[str, str]], list[str]]:
    """Collect gitignored paths and convert them into exclude regex patterns."""
    ignored: list[dict[str, str]] = []
    patterns: list[str] = [r"([\\/]|^)\.git([\\/]|$)"]

    result = run_command(
        [
            "git",
            "-C",
            str(repo_root),
            "ls-files",
            "-o",
            "-i",
            "--exclude-standard",
            "--directory",
            "--no-empty-directory",
            "-z",
        ]
    )
    if result.returncode != 0:
        return ignored, patterns

    raw = result.stdout.split("\x00")
    seen_patterns: set[str] = set(patterns)
    for rel_path in raw:
        if not rel_path:
            continue
        is_directory = rel_path.endswith("/") or rel_path.endswith("\\")
        normalized = rel_path.rstrip("/\\")
        if not normalized:
            continue

        full_path = (repo_root / normalized).resolve()
        escaped = re.escape(str(full_path))
        pattern = f"^{escaped}([\\\\/].*)?$" if is_directory else f"^{escaped}$"
        if pattern not in seen_patterns:
            patterns.append(pattern)
            seen_patterns.add(pattern)

        ignored.append(
            {
                "kind": "directory" if is_directory else "file",
                "relativePath": f"{normalized}/" if is_directory else normalized,
            }
        )

    return ignored, patterns


def resolve_trufflehog_binary(repo_root: Path, explicit_binary: str) -> str:
    """Resolve trufflehog binary path from explicit arg, .temp, PATH, or download."""
    if explicit_binary:
        return explicit_binary

    candidates = local_binary_candidates(repo_root)

    for candidate in candidates:
        if candidate.exists() and can_run_trufflehog(str(candidate)):
            return str(candidate)

    for name in ("trufflehog", "trufflehog.exe"):
        found = shutil.which(name)
        if found and can_run_trufflehog(found):
            return found

    downloaded = download_trufflehog_binary(repo_root)
    if downloaded is not None:
        return downloaded

    print("error: trufflehog binary not found and auto-download failed.", file=sys.stderr)
    sys.exit(1)


def local_binary_candidates(repo_root: Path) -> list[Path]:
    """Return local .temp candidate paths for trufflehog binary."""
    if os.name == "nt":
        return [
            (repo_root / ".temp" / "trufflehog" / "trufflehog.exe").resolve(),
            (repo_root / ".temp" / "trufflehog.exe").resolve(),
        ]
    return [
        (repo_root / ".temp" / "trufflehog" / "trufflehog").resolve(),
        (repo_root / ".temp" / "trufflehog").resolve(),
    ]


def trufflehog_release_asset() -> str | None:
    """Build trufflehog release asset name for current OS/arch."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    if system == "windows":
        os_part = "windows"
        ext = "tar.gz"
    elif system == "linux":
        os_part = "linux"
        ext = "tar.gz"
    elif system == "darwin":
        os_part = "darwin"
        ext = "tar.gz"
    else:
        return None

    arch_map = {
        "x86_64": "amd64",
        "amd64": "amd64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }
    arch_part = arch_map.get(machine)
    if arch_part is None:
        return None

    return f"trufflehog_{TRUFFLEHOG_VERSION}_{os_part}_{arch_part}.{ext}"


def download_trufflehog_binary(repo_root: Path) -> str | None:
    """Download and extract trufflehog binary into repo .temp directory."""
    asset = trufflehog_release_asset()
    if asset is None:
        print(
            (
                "error: unsupported platform for trufflehog auto-download "
                f"({platform.system()} {platform.machine()})."
            ),
            file=sys.stderr,
        )
        return None

    cache_dir = (repo_root / ".temp" / "trufflehog").resolve()
    cache_dir.mkdir(parents=True, exist_ok=True)
    archive_path = cache_dir / asset
    url = f"{TRUFFLEHOG_RELEASE_BASE_URL}/{asset}"

    try:
        print(f"Downloading {url} -> {archive_path}", file=sys.stderr)
        urllib.request.urlretrieve(url, archive_path)  # noqa: S310
    except Exception as exc:
        print(f"error: failed to download trufflehog: {exc}", file=sys.stderr)
        return None

    try:
        with tarfile.open(archive_path, "r:gz") as tf:
            tf.extractall(cache_dir)
    except Exception as exc:
        print(f"error: failed to extract trufflehog archive: {exc}", file=sys.stderr)
        return None

    extracted_name = "trufflehog.exe" if os.name == "nt" else "trufflehog"
    extracted_path = cache_dir / extracted_name
    if not extracted_path.exists():
        print("error: extracted trufflehog binary not found.", file=sys.stderr)
        return None

    target_path = local_binary_candidates(repo_root)[0]
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if extracted_path.resolve() != target_path.resolve():
        try:
            shutil.copy2(extracted_path, target_path)
        except Exception as exc:
            print(f"error: failed to copy trufflehog binary: {exc}", file=sys.stderr)
            return None
    else:
        target_path = extracted_path
    if os.name != "nt":
        target_path.chmod(0o755)
    return str(target_path)


def deep_get(data: dict, path: list[str]) -> object | None:
    """Safely read nested dict path and return None when missing."""
    current: object = data
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def parse_trufflehog_findings(raw_output: str, repo_root: Path) -> list[dict[str, str]]:
    """Parse JSONL findings into compact path + issue records."""
    findings: list[dict[str, str]] = []
    for line in raw_output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict):
            continue

        detector = item.get("DetectorName") or item.get("DetectorType")
        if not detector:
            # Progress/info line, not a finding.
            continue

        file_path = (
            deep_get(item, ["SourceMetadata", "Data", "Filesystem", "file"])
            or deep_get(item, ["SourceMetadata", "Data", "Filesystem", "path"])
            or deep_get(item, ["SourceMetadata", "Data", "Git", "file"])
            or ""
        )
        file_str = str(file_path) if file_path else "(unknown file)"
        try:
            rel_path = str(Path(file_str).resolve().relative_to(repo_root))
        except Exception:
            rel_path = file_str

        verified = item.get("Verified")
        verification = "verified" if verified is True else "unverified"
        findings.append(
            {
                "path": rel_path,
                "issue": f"{detector} ({verification})",
            }
        )
    return findings


def main() -> int:
    """Run scan, write outputs, and optionally print concise summary."""
    args = parse_args()
    scan_root = Path(args.scan_root).resolve()
    repo_root = find_repo_root(scan_root)
    output_file = (repo_root / args.output_file).resolve() if args.output_file else None
    gitignored_output_file = (
        (repo_root / args.gitignored_output_file).resolve()
        if args.gitignored_output_file
        else None
    )
    if output_file is not None:
        output_file.parent.mkdir(parents=True, exist_ok=True)
    if gitignored_output_file is not None:
        gitignored_output_file.parent.mkdir(parents=True, exist_ok=True)

    trufflehog_binary = resolve_trufflehog_binary(repo_root, args.binary)
    if args.doctor_json:
        version_result = run_command([trufflehog_binary, "--version"])
        version_text = (version_result.stdout or version_result.stderr).strip()
        print(
            json.dumps(
                {
                    "ok": version_result.returncode == 0,
                    "binary": trufflehog_binary,
                    "version": version_text,
                }
            )
        )
        return 0 if version_result.returncode == 0 else 1

    gitignored_items, exclude_patterns = collect_gitignored(repo_root)
    if gitignored_output_file is not None:
        gitignored_output_file.write_text(
            json.dumps(gitignored_items, indent=2), encoding="utf-8"
        )

    with tempfile.NamedTemporaryFile(
        mode="w", delete=False, encoding="utf-8", suffix=".txt"
    ) as tmp:
        exclude_file = Path(tmp.name)
        for pattern in exclude_patterns:
            tmp.write(pattern)
            tmp.write("\n")

    cmd = [
        trufflehog_binary,
        "filesystem",
        "--json",
        "--exclude-paths",
        str(exclude_file),
        str(scan_root),
    ]

    try:
        result = run_command(cmd)
        if output_file is not None:
            output_file.write_text(result.stdout, encoding="utf-8")
        if result.stdout and not args.quiet:
            sys.stdout.write(result.stdout)
        if result.stderr and not args.quiet:
            sys.stderr.write(result.stderr)

        if args.summary:
            findings = parse_trufflehog_findings(result.stdout, repo_root)
            if not findings:
                print("OK: 0 secrets found")
            else:
                print(f"FAILED: {len(findings)} potential secret(s) found")
                for finding in findings:
                    print(f"- {finding['path']}: {finding['issue']}")
                if result.returncode == 0:
                    return 1
        return result.returncode
    finally:
        if exclude_file.exists():
            exclude_file.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
