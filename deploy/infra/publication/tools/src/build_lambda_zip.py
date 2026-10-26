#!/usr/bin/env python3
"""Build a reproducible Lambda ZIP, checksum, and member manifest locally."""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import stat
import zipfile
from pathlib import Path

LAMBDA_PACKAGE_NAME = "github_publication_runner"
DEFAULT_OUTPUT = Path("build/publication-lambda.zip")
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        required=True,
        help="directory containing the Lambda package's handler.py and helper modules",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"ZIP output path (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    source_root = args.source.resolve()
    output = args.output.resolve()
    if output.is_relative_to(source_root):
        raise SystemExit("Refusing to write the ZIP inside the Lambda source tree.")

    members = []
    paths = sorted(
        source_root.rglob("*"),
        key=lambda item: item.relative_to(source_root).as_posix(),
    )
    for path in paths:
        if path.is_symlink():
            raise SystemExit(f"Refusing to package a symbolic link: {path}")
        if (
            not path.is_file()
            or path.suffix in {".pyc", ".pyo"}
            or "__pycache__" in path.parts
        ):
            continue
        source_name = path.relative_to(source_root).as_posix()
        relative_name = f"{LAMBDA_PACKAGE_NAME}/{source_name}"
        if not relative_name.isascii():
            raise SystemExit(f"Lambda ZIP member names must be ASCII: {relative_name}")
        content = path.read_bytes()
        members.append(
            {
                "name": relative_name,
                "content": content,
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )

    if not members or not any(
        member["name"] == "github_publication_runner/handler.py" for member in members
    ):
        raise SystemExit(f"Lambda handler source was not found under {source_root}")

    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(
        archive_buffer, mode="w", compression=zipfile.ZIP_STORED
    ) as archive:
        archive.comment = b""
        for member in members:
            info = zipfile.ZipInfo(member["name"], date_time=FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.extra = b""
            info.comment = b""
            archive.writestr(info, member["content"])

    zip_bytes = archive_buffer.getvalue()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(zip_bytes)

    digest = hashlib.sha256(zip_bytes).digest()
    sha256_hex = digest.hex()
    sha256_base64 = base64.b64encode(digest).decode("ascii")
    checksum_path = output.with_suffix(output.suffix + ".sha256")
    checksum_path.write_text(
        f"{sha256_hex}  {output.name}\n", encoding="ascii", newline="\n"
    )
    manifest_path = output.with_suffix(output.suffix + ".manifest.json")
    manifest = {
        "artifact": output.name,
        "artifact_sha256_hex": sha256_hex,
        "artifact_sha256_base64": sha256_base64,
        "compression": "stored",
        "fixed_member_timestamp_utc": "1980-01-01T00:00:00Z",
        "members": [
            {"name": member["name"], "sha256": member["sha256"]} for member in members
        ],
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    print(f"Lambda ZIP: {output}")
    print(f"SHA-256: {sha256_hex}")
    print(f"source_code_hash: {sha256_base64}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
