"""Synchronize a private, versioned bundle of Publisher operator guidance."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
BUNDLE_DIR = REPOSITORY_ROOT / ".local" / "codex-publication-preparation"
ETAG = BUNDLE_DIR / ".remote-etag"
FILES = (
    "codex-instructions.md",
    "pull-request-template.md",
    "pull-request-example.md",
    "release-notes-template.md",
    "release-notes-example.md",
    "publication-task-template.md",
    "publication-task-example.md",
)
BUCKET = "aggregator-publisher-data-905418096305-eu-central-1"
KEY = "operator/codex-publication-preparation.zip"
EXPECTED_ARN = "arn:aws:iam::905418096305:user/aggregator-admin"
MAX_FILE_BYTES = 1024 * 1024


def aws(*args: str) -> dict:
    command = ["aws", "--region", "eu-central-1", *args, "--output", "json"]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.strip() or f"AWS CLI failed: {result.returncode}"
        )
    return json.loads(result.stdout) if result.stdout.strip() else {}


def authorize() -> None:
    identity = aws("sts", "get-caller-identity")
    if identity.get("Arn") != EXPECTED_ARN:
        raise RuntimeError(
            "Select the aggregator-admin AWS profile before synchronizing guidance"
        )


def check_contents() -> None:
    if not BUNDLE_DIR.is_dir() or BUNDLE_DIR.is_symlink():
        raise RuntimeError(f"Create the local guidance directory first: {BUNDLE_DIR}")
    for name in FILES:
        path = BUNDLE_DIR / name
        if not path.is_file() or path.is_symlink():
            raise RuntimeError(f"Missing guidance file: {path}")
        raw = path.read_bytes()
        if not raw or len(raw) > MAX_FILE_BYTES:
            raise RuntimeError(f"Empty or oversized guidance file: {path}")
        raw.decode("utf-8")


def read_archive(path: Path) -> dict[str, bytes]:
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if len(names) != len(FILES) or set(names) != set(FILES):
                raise RuntimeError(
                    "Remote bundle must contain the seven expected Markdown files only"
                )
            if any(
                entry.is_dir()
                or entry.file_size <= 0
                or entry.file_size > MAX_FILE_BYTES
                for entry in entries
            ):
                raise RuntimeError(
                    "Remote bundle contains an empty, oversized, or directory entry"
                )
            contents = {name: archive.read(name) for name in FILES}
            for name, raw in contents.items():
                if not raw or len(raw) > MAX_FILE_BYTES:
                    raise RuntimeError(f"Invalid guidance content: {name}")
                raw.decode("utf-8")
            return contents
    except (zipfile.BadZipFile, zipfile.LargeZipFile) as error:
        raise RuntimeError(
            "Remote guidance bundle is not a valid ZIP archive"
        ) from error


def pull(force: bool = False) -> None:
    if BUNDLE_DIR.is_symlink():
        raise RuntimeError("Local guidance directory must not be a symlink")
    if BUNDLE_DIR.exists() and not force:
        raise RuntimeError(
            f"Local guidance directory already exists: {BUNDLE_DIR}. Use pull --force to replace it"
        )
    BUNDLE_DIR.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".publisher-guidance-", dir=BUNDLE_DIR.parent
    ) as dirname:
        work = Path(dirname)
        archive_path = work / "download.zip"
        response = aws(
            "s3api", "get-object", "--bucket", BUCKET, "--key", KEY, str(archive_path)
        )
        contents = read_archive(archive_path)
        stage = work / "new-bundle"
        stage.mkdir()
        for name, data in contents.items():
            (stage / name).write_bytes(data)
        (stage / ETAG.name).write_text(response["ETag"], encoding="utf-8")
        backup = work / "previous-bundle"
        if BUNDLE_DIR.exists():
            BUNDLE_DIR.replace(backup)
        try:
            stage.replace(BUNDLE_DIR)
        except OSError:
            if backup.exists():
                backup.replace(BUNDLE_DIR)
            raise
    print(f"Downloaded {len(FILES)} guidance files to: {BUNDLE_DIR}")


def push(force: bool = False) -> None:
    check_contents()
    with tempfile.TemporaryDirectory(prefix=".publisher-upload-") as dirname:
        archive_path = Path(dirname) / "guidance.zip"
        with zipfile.ZipFile(
            archive_path, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            for name in FILES:
                archive.write(BUNDLE_DIR / name, arcname=name)
        condition = []
        if not force:
            condition = (
                ["--if-match", ETAG.read_text(encoding="utf-8").strip()]
                if ETAG.is_file()
                else ["--if-none-match", "*"]
            )
        response = aws(
            "s3api",
            "put-object",
            "--bucket",
            BUCKET,
            "--key",
            KEY,
            "--body",
            str(archive_path),
            "--content-type",
            "application/zip",
            "--server-side-encryption",
            "AES256",
            *condition,
        )
    ETAG.write_text(response["ETag"], encoding="utf-8")
    print(
        f"Uploaded {len(FILES)} guidance files to: s3://{BUCKET}/{KEY}"
        f" (version {response.get('VersionId', 'unknown')})"
    )


def confirm(action: str, force: bool) -> None:
    """Require explicit human approval before accessing AWS or changing files."""
    if action == "push":
        operation = f"Upload local guidance to s3://{BUCKET}/{KEY}"
    else:
        operation = f"Download remote guidance to {BUNDLE_DIR}"
    if force:
        operation += " (FORCE: existing content may be replaced)"
    print(operation)
    try:
        response = input("Type 'yes' to confirm: ")
    except (EOFError, KeyboardInterrupt) as error:
        raise RuntimeError(
            "Operation cancelled: interactive confirmation is required"
        ) from error
    if response != "yes":
        raise RuntimeError("Operation cancelled: type exactly 'yes' to proceed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for action in ("pull", "push"):
        sub.add_parser(action).add_argument(
            "--force", action="store_true", help="Permit overwriting an existing copy"
        )
    args = parser.parse_args()
    try:
        confirm(args.action, args.force)
        authorize()
        (pull if args.action == "pull" else push)(args.force)
    except (
        OSError,
        ValueError,
        KeyError,
        UnicodeError,
        RuntimeError,
        zipfile.BadZipFile,
    ) as error:
        parser.exit(1, f"Operator guidance: {error}\n")


if __name__ == "__main__":
    main()
