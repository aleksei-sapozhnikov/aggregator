"""Resolve pinned OpenTofu and TFLint binaries without a system installation."""

from __future__ import annotations

import hashlib
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from code_qa.src.core.utils import dependency_environment, runtime_dir


@dataclass(frozen=True)
class Tool:
    """Describe an official release and its checksum manifest."""

    name: str
    version: str
    repository: str
    checksums: str
    asset_prefix: str
    version_prefix: str
    unsupported_platform: tuple[str, str] | None = None


def host_platform() -> tuple[str, str]:
    """Map common desktop platforms to the official release asset names."""
    system = {"win32": "windows", "linux": "linux", "darwin": "darwin"}.get(
        sys.platform
    )
    architecture = {
        "amd64": "amd64",
        "x86_64": "amd64",
        "aarch64": "arm64",
        "arm64": "arm64",
    }.get(platform.machine().lower())
    if system is None or architecture is None:
        raise ValueError(f"Unsupported platform: {sys.platform}/{platform.machine()}")
    return system, architecture


def matches_version(binary: str, tool: Tool) -> bool:
    """Reuse an installed binary only when it matches the repository's version."""
    try:
        result = subprocess.run(
            [binary, "--version"],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
            env=dependency_environment(),
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return (
        result.returncode == 0
        and re.search(
            re.escape(tool.version_prefix + tool.version) + r"(?:\s|$)",
            result.stdout,
        )
        is not None
    )


def download_tool(tool: Tool, target: Path, system: str, architecture: str) -> None:
    """Verify an official ZIP before extracting only its executable atomically."""
    asset = f"{tool.asset_prefix}_{system}_{architecture}.zip"
    base = f"https://github.com/{tool.repository}/releases/download/v{tool.version}/"
    with urllib.request.urlopen(base + tool.checksums, timeout=30) as response:
        checksums = response.read().decode("utf-8")
    expected = next(
        (
            parts[0]
            for line in checksums.splitlines()
            if len(parts := line.split()) == 2 and parts[1].lstrip("*") == asset
        ),
        None,
    )
    if expected is None or re.fullmatch(r"[a-fA-F0-9]{64}", expected) is None:
        raise ValueError(f"Missing SHA-256 for {asset}")

    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {tool.name} {tool.version} into {target.parent}...", flush=True)
    with tempfile.TemporaryDirectory(
        prefix="download-", dir=target.parent
    ) as temporary:
        archive_path = Path(temporary) / asset
        with (
            urllib.request.urlopen(base + asset, timeout=90) as response,
            archive_path.open("wb") as archive_file,
        ):
            shutil.copyfileobj(response, archive_file)
        digest = hashlib.sha256()
        with archive_path.open("rb") as archive_file:
            for block in iter(lambda: archive_file.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected.lower():
            raise ValueError(f"SHA-256 verification failed for {asset}")
        executable = Path(temporary) / target.name
        with (
            zipfile.ZipFile(archive_path) as archive,
            archive.open(target.name) as source,
            executable.open("wb") as destination,
        ):
            shutil.copyfileobj(source, destination)
        if system != "windows":
            executable.chmod(0o755)
        executable.replace(target)


def resolve_tool(tool: Tool, root: Path | None = None) -> str | None:
    """Prefer the local cache, reuse a matching system tool, or bootstrap locally."""
    try:
        system, architecture = host_platform()
        target = (
            runtime_dir(root)
            / tool.name
            / tool.version
            / f"{system}_{architecture}"
            / (tool.name + (".exe" if system == "windows" else ""))
        )
        if target.is_file():
            return str(target)
        installed = shutil.which(tool.name)
        if installed and matches_version(installed, tool):
            return installed
        if tool.unsupported_platform == (system, architecture):
            raise ValueError(
                f"{tool.name} has no native release for {system}/{architecture}"
            )
        download_tool(tool, target, system, architecture)
        return str(target)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Unable to prepare {tool.name} {tool.version}: {error}", flush=True)
        return None
