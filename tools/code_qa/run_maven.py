"""Resolve Maven for Java tests, bootstrapping a pinned distribution if necessary."""

from __future__ import annotations

import hashlib
import os
import shutil
import stat
import sys
import urllib.request
import zipfile
from pathlib import Path

from utils import repo_root

MAVEN_VERSION = "3.9.11"
MAVEN_ZIP_SHA512 = (
    "03e2d65d4483a3396980629f260e25cac0d8b6f7f2791e4dc20bc83f9514d"
    "b8d0f05b0479e699a5f34679250c49c8e52e961262ded468a20de0be254d8207076"
)
MAVEN_DOWNLOAD_URL = (
    "https://archive.apache.org/dist/maven/maven-3/"
    f"{MAVEN_VERSION}/binaries/apache-maven-{MAVEN_VERSION}-bin.zip"
)


def cached_maven_command(root: Path) -> Path:
    """Return the executable path inside the private QA runtime cache."""
    executable = "mvn.cmd" if sys.platform == "win32" else "mvn"
    return (
        root
        / ".temp"
        / "qa-runtime"
        / "maven"
        / f"apache-maven-{MAVEN_VERSION}"
        / "bin"
        / executable
    )


def ensure_cached_maven(root: Path) -> Path | None:
    """Fetch and verify Maven only when no cached executable exists."""
    command = cached_maven_command(root)
    if command.is_file():
        return command

    cache = command.parent.parent.parent
    cache.mkdir(parents=True, exist_ok=True)
    archive_path = cache / f"apache-maven-{MAVEN_VERSION}-bin.zip"
    try:
        print(f"Downloading Apache Maven {MAVEN_VERSION} for Java tests...", flush=True)
        with urllib.request.urlopen(MAVEN_DOWNLOAD_URL, timeout=90) as response:
            with archive_path.open("wb") as archive_file:
                shutil.copyfileobj(response, archive_file)

        sha512 = hashlib.sha512(archive_path.read_bytes()).hexdigest()
        if sha512 != MAVEN_ZIP_SHA512:
            raise ValueError("Apache Maven archive SHA-512 verification failed")

        with zipfile.ZipFile(archive_path) as archive:
            expected_prefix = f"apache-maven-{MAVEN_VERSION}/"
            for member in archive.namelist():
                if not member.startswith(expected_prefix) or ".." in Path(member).parts:
                    raise ValueError("Unexpected path in Apache Maven archive")
            archive.extractall(cache)

        if not command.is_file():
            raise FileNotFoundError("Apache Maven executable missing from downloaded archive")

        if sys.platform != "win32":
            command.chmod(command.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP)

        return command
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Unable to bootstrap Apache Maven: {error}", flush=True)
        return None
    finally:
        archive_path.unlink(missing_ok=True)


def resolve_maven_command(root: Path | None = None) -> str | None:
    """Prefer Maven on PATH and fall back to the verified local distribution."""
    executable = "mvn.cmd" if sys.platform == "win32" else "mvn"
    if shutil.which(executable):
        return executable

    root = root or repo_root()
    cached = ensure_cached_maven(root)
    if cached is None:
        print(
            "Maven was not found in PATH and automatic installation failed. "
            "Install Maven 3.9+ or make the download URL accessible.",
            flush=True,
        )
        return None
    return str(cached)
