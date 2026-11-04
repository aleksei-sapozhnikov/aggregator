"""Resolve a JDK 25, downloading Eclipse Temurin into the QA cache if needed."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath, PureWindowsPath

from code_qa.src.core.utils import repo_root

JAVA_MAJOR = 25
ADOPTIUM_API = f"https://api.adoptium.net/v3/assets/latest/{JAVA_MAJOR}/hotspot"


def platform_details() -> tuple[str, str]:
    """Map this host to the platform identifiers used by the Adoptium API."""
    os_name = {"win32": "windows", "linux": "linux", "darwin": "mac"}.get(sys.platform)
    machine = platform.machine().lower()
    arch = {
        "amd64": "x64",
        "x86_64": "x64",
        "aarch64": "aarch64",
        "arm64": "aarch64",
    }.get(machine)
    if os_name is None or arch is None:
        raise ValueError(f"Unsupported JDK platform: {sys.platform}/{machine}")
    return os_name, arch


def jdk_executable(home: Path, name: str) -> Path:
    """Return a JDK binary with the correct Windows suffix."""
    return home / "bin" / (name + (".exe" if sys.platform == "win32" else ""))


def is_jdk_25(home: Path) -> bool:
    """Require both a Java runtime and a Java 25 compiler."""
    java, javac = jdk_executable(home, "java"), jdk_executable(home, "javac")
    if not java.is_file() or not javac.is_file():
        return False
    try:
        result = subprocess.run(
            [str(javac), "-version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    match = re.search(r"\bjavac\s+(\d+)", result.stdout + result.stderr)
    return result.returncode == 0 and match is not None and int(match[1]) == JAVA_MAJOR


def java_environment(home: Path) -> dict[str, str]:
    """Scope JAVA_HOME and PATH to the subprocess; do not alter the user's shell."""
    env = os.environ.copy()
    env["JAVA_HOME"] = str(home)
    env["PATH"] = str(home / "bin") + os.pathsep + env.get("PATH", "")
    return env


def cached_jdk_root(root: Path) -> Path:
    """Return the persistent cache location for this OS and architecture."""
    os_name, arch = platform_details()
    return (
        root
        / ".local"
        / "qa-runtime"
        / "jdk"
        / f"temurin-{JAVA_MAJOR}-{os_name}-{arch}"
    )


def find_jdk_home(directory: Path) -> Path | None:
    """Find the JDK home, including the macOS Contents/Home layout."""
    candidates = [directory, directory / "Contents" / "Home"]
    return next((path for path in candidates if is_jdk_25(path)), None)


def adoptium_package() -> tuple[str, str]:
    """Look up the latest GA Temurin JDK 25 archive and its SHA-256 digest."""
    os_name, arch = platform_details()
    query = urllib.parse.urlencode(
        {"architecture": arch, "image_type": "jdk", "os": os_name, "vendor": "eclipse"}
    )
    with urllib.request.urlopen(f"{ADOPTIUM_API}?{query}", timeout=30) as response:
        releases = json.load(response)

    if not isinstance(releases, list) or not releases:
        raise ValueError("Adoptium did not return a JDK 25 release")
    release = releases[0]
    if not isinstance(release, dict):
        raise TypeError("Invalid Adoptium release metadata")
    binary = release.get("binary")
    if not isinstance(binary, dict):
        raise TypeError("Invalid Adoptium binary metadata")
    package = binary.get("package")
    if not isinstance(package, dict):
        raise TypeError("Invalid Adoptium package metadata")
    url, sha256 = package.get("link"), package.get("checksum")
    if not isinstance(url, str) or not isinstance(sha256, str):
        raise TypeError("Adoptium release lacks download link or SHA-256")
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "github.com"
        or not parsed.path.startswith(
            f"/adoptium/temurin{JAVA_MAJOR}-binaries/releases/download/"
        )
    ):
        raise ValueError("Unexpected Temurin download source")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", sha256):
        raise ValueError("Invalid Temurin checksum")
    expected_suffix = ".zip" if os_name == "windows" else ".tar.gz"
    if not parsed.path.endswith(expected_suffix):
        raise ValueError("Unexpected Temurin archive format")
    return url, sha256.lower()


def validate_archive_path(name: str) -> None:
    """Reject absolute and parent-traversal paths before extraction."""
    # Interpret archive paths the same way on Linux, macOS, and Windows.
    path = PurePosixPath(name.replace("\\", "/"))
    if (
        not path.parts
        or path.is_absolute()
        or ".." in path.parts
        or bool(PureWindowsPath(name).drive)
    ):
        raise ValueError(f"Unsafe path in Temurin archive: {name}")


def extract_archive(archive_path: Path, destination: Path) -> None:
    """Extract a validated distribution, preserving Unix executable permissions."""
    os_name, _ = platform_details()
    if os_name == "windows":
        with zipfile.ZipFile(archive_path) as archive:
            for info in archive.infolist():
                validate_archive_path(info.filename)
            archive.extractall(destination)
    else:
        with tarfile.open(archive_path, "r:gz") as archive:
            for item in archive.getmembers():
                validate_archive_path(item.name)
            archive.extractall(destination, filter="data")


def bootstrap_temurin(root: Path) -> Path | None:
    """Download, verify, and cache a JDK without installing it system-wide."""
    target = cached_jdk_root(root)
    if target.is_dir():
        cached_home = find_jdk_home(target)
        if cached_home is not None:
            return cached_home

    cache = target.parent
    cache.mkdir(parents=True, exist_ok=True)
    try:
        url, checksum = adoptium_package()
        print(
            f"Downloading Eclipse Temurin JDK {JAVA_MAJOR} into {cache}...",
            flush=True,
        )
        with tempfile.TemporaryDirectory(dir=cache, prefix="jdk-install-") as temp:
            staging = Path(temp)
            archive_path = staging / (
                "jdk.zip" if sys.platform == "win32" else "jdk.tar.gz"
            )
            digest = hashlib.sha256()
            with (
                urllib.request.urlopen(url, timeout=120) as response,
                archive_path.open("wb") as output,
            ):
                while chunk := response.read(1024 * 1024):
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != checksum:
                raise ValueError("Temurin SHA-256 checksum verification failed")

            extracted = staging / "extracted"
            extracted.mkdir()
            extract_archive(archive_path, extracted)
            roots = [path for path in extracted.iterdir() if path.is_dir()]
            if len(roots) != 1:
                raise ValueError("Unexpected Temurin archive layout")
            home = find_jdk_home(roots[0])
            if home is None:
                raise ValueError(
                    f"Downloaded archive does not contain JDK {JAVA_MAJOR}"
                )

            if target.exists():
                shutil.rmtree(target)
            roots[0].rename(target)

        return find_jdk_home(target)
    except (
        OSError,
        ValueError,
        KeyError,
        TypeError,
        tarfile.TarError,
        zipfile.BadZipFile,
    ) as error:
        print(
            f"Unable to prepare Eclipse Temurin JDK {JAVA_MAJOR}: {error}",
            flush=True,
        )
        return None


def resolve_java_home(root: Path | None = None) -> Path | None:
    """Prefer an installed JDK 25; otherwise reuse or download private Temurin."""
    root = root or repo_root()
    if java_home := os.environ.get("JAVA_HOME"):
        path = Path(java_home)
        if is_jdk_25(path):
            return path

    if javac := shutil.which("javac"):
        home = Path(javac).resolve().parent.parent
        if is_jdk_25(home):
            return home

    cached = cached_jdk_root(root)
    if cached.is_dir():
        home = find_jdk_home(cached)
        if home is not None:
            return home

    home = bootstrap_temurin(root)
    if home is None:
        print(
            "JDK 25 was not found and Eclipse Temurin could not be downloaded. "
            "Install OpenJDK 25 or allow access to api.adoptium.net and GitHub.",
            flush=True,
        )
    return home
