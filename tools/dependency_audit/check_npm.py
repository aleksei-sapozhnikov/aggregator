"""Check npm package security advisories and show update suggestions."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

SEVERITY_ORDER = {
    "info": 0,
    "low": 1,
    "moderate": 2,
    "high": 3,
    "critical": 4,
}
EXCLUDED_DIRS = {
    ".git",
    ".temp",
    "build",
    "dist",
    "node_modules",
    "target",
}


def repo_root() -> Path:
    """Return repository root directory."""
    return Path(__file__).resolve().parent.parent.parent


def npm_command() -> str:
    """Return npm executable name for the current platform."""
    return "npm.cmd" if sys.platform == "win32" else "npm"


def npm_projects(root: Path) -> list[Path]:
    """Return npm project directories that have both package and lock files."""
    projects: list[Path] = []
    for package_json in root.rglob("package.json"):
        rel = package_json.relative_to(root)
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        project_dir = package_json.parent
        if (project_dir / "package-lock.json").exists():
            projects.append(project_dir)
    return sorted(projects)


def run_json(cmd: list[str], cwd: Path) -> tuple[int, dict[str, Any]]:
    """Run a command that emits JSON and return parsed output."""
    result = subprocess.run(
        cmd,
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    raw = result.stdout.strip()
    if not raw:
        return result.returncode, {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print(result.stdout.strip())
        print(result.stderr.strip(), file=sys.stderr)
        return result.returncode or 1, {}
    return result.returncode, data if isinstance(data, dict) else {}


def vulnerability_level(vulnerability: dict[str, Any]) -> int:
    """Return numeric severity for an npm audit vulnerability."""
    severity = str(vulnerability.get("severity", "info")).lower()
    return SEVERITY_ORDER.get(severity, 0)


def fix_hint(fix_available: object) -> str:
    """Return a compact fix hint from npm audit fixAvailable data."""
    if fix_available is True:
        return "npm audit fix"
    if isinstance(fix_available, dict):
        name = fix_available.get("name")
        version = fix_available.get("version")
        major = " (major)" if fix_available.get("isSemVerMajor") else ""
        if name and version:
            return f"update {name} to {version}{major}"
    return "manual review"


def emit_audit(project_dir: Path, data: dict[str, Any], audit_level: str) -> bool:
    """Print npm audit findings and return whether the project passed."""
    root = repo_root()
    rel = project_dir.relative_to(root)
    vulnerabilities = data.get("vulnerabilities")
    if not isinstance(vulnerabilities, dict) or not vulnerabilities:
        print(f"{rel}: audit OK")
        return True

    threshold = SEVERITY_ORDER[audit_level]
    failed = False
    print(f"{rel}: audit found {len(vulnerabilities)} vulnerable package(s)")
    for name, raw in sorted(vulnerabilities.items()):
        if not isinstance(raw, dict):
            continue
        severity = str(raw.get("severity", "info")).lower()
        direct = "direct" if raw.get("isDirect") else "transitive"
        hint = fix_hint(raw.get("fixAvailable"))
        print(f"  {severity}: {name} ({direct}); fix: {hint}")
        if vulnerability_level(raw) >= threshold:
            failed = True
    return not failed


def emit_outdated(project_dir: Path, data: dict[str, Any]) -> None:
    """Print direct dependency update suggestions from npm outdated output."""
    root = repo_root()
    rel = project_dir.relative_to(root)
    if not data:
        print(f"{rel}: dependencies current")
        return

    print(f"{rel}: update suggestions")
    for name, raw in sorted(data.items()):
        if not isinstance(raw, dict):
            continue
        current = raw.get("current", "?")
        wanted = raw.get("wanted", "?")
        latest = raw.get("latest", "?")
        dependent = raw.get("dependent", "")
        print(f"  {name}: current {current}, wanted {wanted}, latest {latest} ({dependent})")


def main() -> int:
    """Run npm dependency audit across repository npm projects."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--audit-level",
        choices=sorted(SEVERITY_ORDER, key=SEVERITY_ORDER.get),
        default="moderate",
        help="Minimum audit severity that fails the command.",
    )
    args = parser.parse_args()

    root = repo_root()
    projects = npm_projects(root)
    if not projects:
        print("No npm projects with package-lock.json found.")
        return 0

    npm = npm_command()
    failed = False
    for project_dir in projects:
        audit_rc, audit_data = run_json([npm, "audit", "--json"], cwd=project_dir)
        if audit_rc not in (0, 1):
            print(f"{project_dir.relative_to(root)}: npm audit failed")
            failed = True
            continue
        if not emit_audit(project_dir, audit_data, args.audit_level):
            failed = True

        outdated_rc, outdated_data = run_json([npm, "outdated", "--json"], cwd=project_dir)
        if outdated_rc not in (0, 1):
            print(f"{project_dir.relative_to(root)}: npm outdated failed")
            failed = True
            continue
        emit_outdated(project_dir, outdated_data)

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
