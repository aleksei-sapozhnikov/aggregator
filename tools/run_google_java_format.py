#!/usr/bin/env python3
"""Run google-java-format in explicit check/format mode for provided Java files."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

GOOGLE_JAVA_FORMAT_VERSION = "1.34.1"
GOOGLE_JAVA_FORMAT_URL = (
    "https://repo1.maven.org/maven2/com/google/googlejavaformat/"
    f"google-java-format/{GOOGLE_JAVA_FORMAT_VERSION}/"
    f"google-java-format-{GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar"
)
MIN_SUPPORTED_JAVA_MAJOR = 21


def parse_args() -> argparse.Namespace:
    """Parse formatter mode and explicit Java file list."""
    parser = argparse.ArgumentParser(
        description="Run google-java-format in format or check mode."
    )
    parser.add_argument("--mode", choices=("format", "check"), required=True)
    parser.add_argument("files", nargs="+", help="Java files.")
    return parser.parse_args()


def ensure_java_installed() -> None:
    """Exit with readable error when Java is missing from PATH."""
    if shutil.which("java") is None:
        print(
            "error: Java runtime not found in PATH. Install JDK/JRE and retry.",
            file=sys.stderr,
        )
        sys.exit(1)


def get_java_major_version() -> int | None:
    """Extract Java major version from `java -version` output."""
    result = subprocess.run(
        ["java", "-version"], check=False, capture_output=True, text=True
    )
    combined = f"{result.stdout}\n{result.stderr}"
    match = re.search(r'version "([^"]+)"', combined)
    if not match:
        return None

    version = match.group(1)
    if version.startswith("1."):
        parts = version.split(".")
        return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else None

    major_match = re.match(r"(\d+)", version)
    return int(major_match.group(1)) if major_match else None


def ensure_java_compatible() -> int:
    """Validate Java version compatibility for configured formatter."""
    ensure_java_installed()
    major = get_java_major_version()
    if major is None:
        print(
            "error: Could not detect Java major version from `java -version`.",
            file=sys.stderr,
        )
        sys.exit(1)

    if major < MIN_SUPPORTED_JAVA_MAJOR:
        print(
            (
                "error: google-java-format requires JDK 21+ in this setup "
                f"(detected Java {major}). "
                "Use JDK 21 or newer (for example 21 or 25). "
                "If you must stay on JDK 17, pin an older google-java-format version."
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    return major


def ensure_formatter_jar(repo_root: Path) -> Path:
    """Return cached formatter JAR path, downloading it when missing."""
    cache_dir = repo_root / ".temp" / "google-java-format"
    cache_dir.mkdir(parents=True, exist_ok=True)
    jar_path = (
        cache_dir / f"google-java-format-{GOOGLE_JAVA_FORMAT_VERSION}-all-deps.jar"
    )
    if jar_path.exists():
        return jar_path

    print(f"Downloading {GOOGLE_JAVA_FORMAT_URL} -> {jar_path}")
    urllib.request.urlretrieve(GOOGLE_JAVA_FORMAT_URL, jar_path)  # noqa: S310
    return jar_path


def normalize_files(repo_root: Path, paths: list[str]) -> list[Path]:
    """Resolve relative Java paths against repository root."""
    return [
        (Path(path) if Path(path).is_absolute() else (repo_root / path)).resolve()
        for path in paths
        if path.endswith(".java")
    ]


def run_formatter(jar_path: Path, mode: str, files: list[Path], java_major: int) -> int:
    """Run formatter/check against files and map failures to concise output."""
    if not files:
        return 0

    failed = False
    printed_compat_hint = False
    for file_path in files:
        cmd = ["java", "-jar", str(jar_path)]
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
                            "Use JDK 21 or newer with google-java-format 1.34.1."
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
    script_path = Path(__file__).resolve()
    repo_root = script_path.parent.parent
    os.chdir(repo_root)

    java_major = ensure_java_compatible()
    jar_path = ensure_formatter_jar(repo_root)
    files = normalize_files(repo_root, args.files)
    return run_formatter(jar_path, args.mode, files, java_major)


if __name__ == "__main__":
    raise SystemExit(main())
