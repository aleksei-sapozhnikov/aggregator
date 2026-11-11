"""Package an AL2023 Git binary and its dependencies into a Lambda layer."""

from __future__ import annotations

import hashlib
import shutil
import stat
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGE = "aggregator-publisher-git-layer:al2023"


def _container_runtime() -> str:
    """Prefer Docker when available, otherwise use Podman."""
    runtime = shutil.which("docker") or shutil.which("podman")
    if not runtime:
        raise RuntimeError(
            "Docker or Podman is required to build the Lambda Git layer"
        )
    return runtime


def _container_command(runtime: str, *args: str) -> str:
    try:
        result = subprocess.run(
            [runtime, *args], check=True, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900,
        )
    except subprocess.CalledProcessError as error:
        # Podman writes build-step diagnostics to stdout and the final status
        # to stderr. Preserve both streams instead of hiding the failing command.
        output = "\n".join(
            chunk.strip()
            for chunk in (error.stdout, error.stderr)
            if chunk and chunk.strip()
        )
        diagnostic = output[-5000:]
        raise RuntimeError(
            f"Git layer {Path(runtime).name} {args[0]} failed "
            f"(exit {error.returncode}): "
            f"{diagnostic or 'container engine provided no diagnostics'}"
        ) from None
    except subprocess.TimeoutExpired:
        raise RuntimeError(
            f"Git layer {Path(runtime).name} {args[0]} timed out after 900 seconds"
        ) from None
    except OSError as error:
        raise RuntimeError(
            f"Git layer could not start {Path(runtime).name} {args[0]}: "
            f"{type(error).__name__}"
        ) from None
    return result.stdout.strip()


def build_git_layer(zip_path: Path) -> None:
    """Use the matching Lambda image so host OS never affects Git binaries."""
    runtime = _container_runtime()
    print(f"Git Lambda layer builder: {Path(runtime).name}")
    _container_command(
        runtime, "build", "--platform", "linux/amd64", "--pull",
        "-t", IMAGE, str(ROOT / "git-layer"),
    )
    container = _container_command(
        runtime, "create", "--platform", "linux/amd64", IMAGE,
    )
    try:
        with tempfile.TemporaryDirectory(prefix="publisher-git-layer-") as folder:
            stage = Path(folder)
            _container_command(runtime, "cp", f"{container}:/layer/.", str(stage))
            required = [
                stage / "bin" / "git",
                stage / "libexec" / "git-core" / "git-remote-https",
            ]
            if not all(item.is_file() for item in required):
                raise RuntimeError("Git layer is missing git or git-remote-https")
            if not any((stage / "lib").iterdir()):
                raise RuntimeError("Git layer has no native shared libraries")
            zip_path.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED,
                                 compresslevel=9) as archive:
                for file in sorted(stage.rglob("*")):
                    if not file.is_file():
                        continue
                    rel = file.relative_to(stage).as_posix()
                    executable = rel in (
                        "bin/git", "libexec/git-core/git-remote-https",
                    )
                    mode = stat.S_IFREG | (0o755 if executable else 0o644)
                    entry = zipfile.ZipInfo(rel)
                    entry.create_system = 3
                    entry.external_attr = mode << 16
                    entry.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(entry, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    finally:
        _container_command(runtime, "rm", "-f", container)
    print(f"Git Lambda layer: {zip_path}")
    print(f"SHA256: {hashlib.sha256(zip_path.read_bytes()).hexdigest()}")
