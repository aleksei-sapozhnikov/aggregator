"""Check or apply Java source formatting."""

from __future__ import annotations

import argparse
import hashlib
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from code_qa.src.core.inputs import add_file_arguments, file_inputs
from code_qa.src.tools.jdk import JAVA_MAJOR, jdk_executable, resolve_java_home

GOOGLE_JAVA_FORMAT_VERSION = "1.34.1"
GOOGLE_JAVA_FORMAT_URL = (
    "https://github.com/google/google-java-format/releases/download/"
    f"v{GOOGLE_JAVA_FORMAT_VERSION}/"
    f"google-java-format-{GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar"
)
# SHA-256 published for the pinned asset in the official GitHub release.
GOOGLE_JAVA_FORMAT_SHA256 = (
    "79e1cb5c8bd698c572c0ae504d07816129b8fc06204fb49550bec83bd5ea0aa8"
)
MIN_SUPPORTED_JAVA_MAJOR = 21
QA_RUNTIME_DIR = "qa-runtime"


def min_java_requirement_label() -> str:
    """Return human-readable Java requirement label."""
    return f"{MIN_SUPPORTED_JAVA_MAJOR}+"


def parse_args() -> argparse.Namespace:
    """Parse the required formatter inputs and mode."""
    parser = argparse.ArgumentParser(
        description="Run java formatter in check-only or format mode."
    )
    add_file_arguments(parser)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--check-only",
        action="store_true",
        help="Check formatting and fail when files need changes.",
    )
    group.add_argument(
        "--format",
        action="store_true",
        help="Apply formatting changes in-place.",
    )
    args = parser.parse_args()
    args.mode = "format" if args.format else "check"
    return args


def sha256_file(path: Path) -> str:
    """Hash a local artifact without loading the whole file into memory."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_formatter_jar(repo_root: Path) -> Path:
    """Return cached formatter JAR path, downloading it when missing."""
    cache_dir = repo_root / ".local" / QA_RUNTIME_DIR / "google-java-format"
    cache_dir.mkdir(parents=True, exist_ok=True)
    jar_path = (
        cache_dir / f"google-java-format-{GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar"
    )
    if jar_path.is_file() and sha256_file(jar_path) == GOOGLE_JAVA_FORMAT_SHA256:
        return jar_path

    print(f"Downloading {GOOGLE_JAVA_FORMAT_URL} -> {jar_path}")
    # Never make an unverified or incomplete download available as the cached JAR.
    with tempfile.TemporaryDirectory(prefix="java-format-", dir=cache_dir) as temp:
        candidate = Path(temp) / jar_path.name
        urllib.request.urlretrieve(GOOGLE_JAVA_FORMAT_URL, candidate)
        if sha256_file(candidate) != GOOGLE_JAVA_FORMAT_SHA256:
            raise ValueError("google-java-format JAR SHA-256 verification failed")
        candidate.replace(jar_path)
    return jar_path


def formatter_jar_path(repo_root: Path) -> Path:
    """Return expected cached formatter jar path."""
    return (
        repo_root
        / ".local"
        / QA_RUNTIME_DIR
        / "google-java-format"
        / f"google-java-format-{GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar"
    )


def run_formatter(
    jar_path: Path,
    mode: str,
    files: list[Path],
    java_major: int,
    java_command: str = "java",
) -> int:
    """Run formatter/check against files and map failures to concise output."""
    if not files:
        return 0

    failed = False
    printed_compat_hint = False
    for file_path in files:
        cmd = [java_command, "-jar", str(jar_path)]
        if mode == "format":
            cmd.extend(["--replace", str(file_path)])
        else:
            cmd.extend(["--dry-run", "--set-exit-if-changed", str(file_path)])

        result = subprocess.run(cmd, check=False, capture_output=True, text=True)
        if result.returncode != 0:
            failed = True
            combined = f"{result.stdout}\n{result.stderr}"
            if (
                "NoSuchMethodError" in combined
                and "DeferredDiagnosticHandler.getDiagnostics" in combined
            ):
                if not printed_compat_hint:
                    print(
                        (
                            "error: Java/google-java-format compatibility issue detected. "
                            f"Current Java major: {java_major}. "
                            f"Use JDK {min_java_requirement_label()} or newer with "
                            f"google-java-format {GOOGLE_JAVA_FORMAT_VERSION}."
                        ),
                        file=sys.stderr,
                    )
                    printed_compat_hint = True
                continue

            sys.stdout.write(result.stdout)
            sys.stderr.write(result.stderr)

    return 1 if failed else 0


def main() -> int:
    """Execute java format/check flow from parsed CLI arguments."""
    args = parse_args()
    inputs = file_inputs(args)
    root = inputs.root
    os.chdir(root)

    java_home = resolve_java_home(root)
    if java_home is None:
        return 1
    java_major = JAVA_MAJOR
    try:
        jar_path = ensure_formatter_jar(root)
    except (OSError, ValueError) as error:
        print(f"Unable to prepare Java formatter: {error}", file=sys.stderr)
        return 1
    files = [path for path in inputs.files if path.suffix.lower() == ".java"]
    return run_formatter(
        jar_path,
        args.mode,
        files,
        java_major,
        java_command=str(jdk_executable(java_home, "java")),
    )


if __name__ == "__main__":
    raise SystemExit(main())
