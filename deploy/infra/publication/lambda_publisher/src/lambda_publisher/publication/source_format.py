"""Parse and validate pull-request metadata, source paths, and queue CSV plans."""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

PLAN_COLUMNS = ("id", "branch", "release", "open_at", "merge_at", "pr_file", "entry_mode", "existing_pr_number")
PR_FIELDS = ("id", "branch", "depends_on", "release", "version_boundary", "expected_source_commits", "outcome", "title")
FORMULA_PREFIXES = ("=", "+", "-", "@")
SLUG = re.compile(r"^[0-9]{3,}-[a-z0-9][a-z0-9-]*\.md$")
TAG = re.compile(r"^v\d+\.\d+\.\d+$")


def _scalar(value: str):
    value = value.strip()
    if not value:
        return ""
    if value[0] in ('"', "'"):
        if value[0] == '"':
            return json.loads(value)
        if not value.endswith("'"):
            raise ValueError("unterminated YAML string")
        return value[1:-1].replace("''", "'")
    if value in ("true", "false"):
        return value == "true"
    if re.fullmatch(r"\d+", value):
        return int(value)
    if value in ("null", "~"):
        return None
    if "#" in value or value.startswith(("[", "{", "!", "&", "*")):
        raise ValueError("unsupported YAML syntax; use simple mappings or JSON")
    return value


def read_mapping(path: Path) -> dict:
    """Read JSON or the deliberately small, safe YAML subset in our templates."""
    raw = path.read_text(encoding="utf-8-sig")
    if raw.lstrip().startswith("{"):
        result = json.loads(raw)
    else:
        lines = []
        for raw_line in raw.splitlines():
            if not raw_line.strip() or raw_line.lstrip().startswith("#"):
                continue
            if "\t" in raw_line[:len(raw_line) - len(raw_line.lstrip())]:
                raise ValueError("tabs in YAML indentation")
            lines.append((len(raw_line) - len(raw_line.lstrip()), raw_line.strip()))

        def parse(at: int, indent: int):
            if at >= len(lines) or lines[at][0] != indent:
                raise ValueError("invalid YAML indentation")
            sequence = lines[at][1].startswith("- ")
            result = [] if sequence else {}
            while at < len(lines) and lines[at][0] == indent:
                line = lines[at][1]
                if sequence:
                    if not line.startswith("- "):
                        raise ValueError("mixed YAML collection")
                    line = line[2:]
                    if ":" not in line:
                        raise ValueError("YAML list items must be mappings")
                    key, value = line.split(":", 1)
                    key = key.strip()
                    key = _scalar(key) if key.startswith(("'", '"')) else key
                    item = {key: _scalar(value)}
                    at += 1
                    if at < len(lines) and lines[at][0] > indent:
                        child, at = parse(at, lines[at][0])
                        if not isinstance(child, dict) or set(child) & set(item):
                            raise ValueError("invalid YAML list mapping")
                        item.update(child)
                    result.append(item)
                else:
                    if ":" not in line or line.startswith("- "):
                        raise ValueError("invalid YAML mapping")
                    key, value = line.split(":", 1)
                    key = key.strip()
                    key = _scalar(key) if key.startswith(("'", '"')) else key
                    if not key or key in result:
                        raise ValueError(f"duplicate or empty YAML key: {key}")
                    at += 1
                    if value.strip():
                        result[key] = _scalar(value)
                    elif at < len(lines) and lines[at][0] > indent:
                        result[key], at = parse(at, lines[at][0])
                    else:
                        result[key] = None
            return result, at

        if not lines:
            raise ValueError("empty YAML file")
        result, end = parse(0, lines[0][0])
        if end != len(lines):
            raise ValueError("inconsistent YAML indentation")
    if not isinstance(result, dict):
        raise ValueError("top-level mapping required")
    return result


def render_pr(row: dict) -> str:
    lines = ["---"]
    for key in PR_FIELDS:
        value = row[key]
        lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    return "\n".join(lines) + "\n---\n\n" + row["body"] + "\n"


def read_pr(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n")
    if not raw.startswith("---\n") or "\n---\n" not in raw[4:]:
        raise ValueError(f"{path}: one YAML front matter block required")
    meta, body = raw[4:].split("\n---\n", 1)
    if body.startswith("\n"):
        body = body[1:]
    body = body.rstrip("\n")
    lines = meta.splitlines()
    if len(lines) != len(PR_FIELDS):
        raise ValueError(f"{path}: expected exactly {len(PR_FIELDS)} metadata fields")
    parsed = {}
    for line in lines:
        if ":" not in line:
            raise ValueError(f"{path}: invalid metadata")
        key, value = line.split(":", 1)
        if key not in PR_FIELDS or key in parsed:
            raise ValueError(f"{path}: duplicate or unknown field {key}")
        parsed[key] = _scalar(value)
    if set(parsed) != set(PR_FIELDS):
        raise ValueError(f"{path}: missing metadata")
    if (not body.startswith("- ") or "\n\n## Result\n- " not in body or
            body.startswith("Title:") or "\nTitle:" in body or "\n---\n" in body):
        raise ValueError(f"{path}: malformed PR body")
    if not isinstance(parsed["id"], int) or parsed["id"] <= 0 or not isinstance(parsed["version_boundary"], bool):
        raise ValueError(f"{path}: invalid ID or version flag")
    if not isinstance(parsed["expected_source_commits"], int) or parsed["expected_source_commits"] <= 0:
        raise ValueError(f"{path}: invalid expected commit count")
    for key in ("branch", "depends_on", "release", "outcome", "title"):
        if not isinstance(parsed[key], str) or not parsed[key].strip() or parsed[key][0] in FORMULA_PREFIXES:
            raise ValueError(f"{path}: invalid {key}")
    parsed["body"] = body
    return parsed


def plan_csv(rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=PLAN_COLUMNS, lineterminator="\r\n")
    writer.writeheader()
    writer.writerows(rows)
    return ("\ufeff" + stream.getvalue()).encode("utf-8")


def read_plan(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream, strict=True)
        if tuple(reader.fieldnames or ()) != PLAN_COLUMNS:
            raise ValueError("publication plan columns or order differ from required schema")
        rows = list(reader)
    for row in rows:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("publication plan has missing or extra cells")
        for key, value in row.items():
            if key not in ("open_at", "merge_at") and value.startswith(FORMULA_PREFIXES):
                raise ValueError(f"spreadsheet formula prefix in {key}")
    return rows


def _local(value: str, tz: ZoneInfo) -> datetime:
    if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d", value):
        raise ValueError(f"invalid local ISO timestamp: {value}")
    dt = datetime.fromisoformat(value)
    wall = dt.replace(tzinfo=None)
    if wall.replace(tzinfo=tz, fold=0).utcoffset() != wall.replace(tzinfo=tz, fold=1).utcoffset():
        raise ValueError(f"ambiguous or nonexistent local wall time: {value}")
    matches = [fold for fold in (0, 1) if wall.replace(tzinfo=tz, fold=fold).utcoffset() == dt.utcoffset()
               and wall.replace(tzinfo=tz, fold=fold).astimezone(timezone.utc).astimezone(tz).replace(tzinfo=None) == wall]
    if not matches:
        raise ValueError(f"ambiguous, nonexistent, or wrong-offset local time: {value}")
    return dt


def _safe_pr_path(root: Path, value: str, pr_dir: Path) -> Path:
    if not value or "\\" in value or Path(value).is_absolute() or ".." in Path(value).parts:
        raise ValueError(f"unsafe PR path: {value}")
    path = (root / value).resolve()
    if path.parent != pr_dir.resolve() or not SLUG.fullmatch(path.name):
        raise ValueError(f"PR path outside active source directory or invalid filename: {value}")
    return path
