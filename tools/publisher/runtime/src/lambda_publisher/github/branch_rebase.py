"""Safely rebase only a queued PR's own commits inside the Publisher Lambda."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .github_client import Retryable

_SHA = re.compile(r"[0-9a-f]{40}\Z")
_BRANCH = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]*\Z")
_TIMEOUT_SECONDS = 180


def _run(git: str, args: list[str], *, cwd: Path, env: dict) -> str:
    try:
        result = subprocess.run(
            [git, *args], cwd=cwd, env=env, text=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=_TIMEOUT_SECONDS, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        raise Retryable(
            f"Git operation unavailable or timed out: {args[0]}"
        ) from None
    if result.returncode:
        # Git's stderr can include credentials, remote URLs, or source content.
        # Only the operation name and exit status are safe to expose.
        raise Retryable(
            f"Git operation {args[0]} failed (exit {result.returncode}); "
            "check branch ancestry, conflicts, and write permissions"
        )
    return result.stdout.strip()


def _valid_inputs(branch: str, head: str, base: str, count: int) -> None:
    if not isinstance(branch, str) or not _BRANCH.fullmatch(branch):
        raise ValueError("invalid queued branch name")
    if branch == "main" or ".." in branch or "@{" in branch or branch.endswith(("/", ".lock")):
        raise ValueError("invalid or protected queued branch")
    if not _SHA.fullmatch(head) or not _SHA.fullmatch(base):
        raise ValueError("invalid branch SHA")
    if type(count) is not int or not 1 <= count <= 200:
        raise ValueError("invalid expected_source_commits")


def rebase_source_branch(
    repository: str,
    branch: str,
    head: str,
    base: str,
    count: int,
    token: str,
    *,
    remote_url: str | None = None,
) -> str:
    """Replay a linear suffix, validate both remote refs, then force-with-lease.

    remote_url exists for local bare-repository tests. Production always derives
    the remote from the allowlisted GitHub repository, never from the JSON plan.
    """
    _valid_inputs(branch, head, base, count)
    if repository != "aleksei-sapozhnikov/aggregator":
        raise ValueError("repository is not on Publisher's allowlist")
    remote = remote_url or f"https://github.com/{repository}.git"
    git = "/opt/bin/git" if Path("/opt/bin/git").is_file() else shutil.which("git")
    if not git:
        raise Retryable("Git executable missing from Publisher Lambda layer")

    with tempfile.TemporaryDirectory(prefix="publisher-rebase-") as directory:
        root = Path(directory)
        work = root / "repo"
        work.mkdir()
        askpass = root / "askpass.sh"
        askpass.write_text(
            '#!/bin/sh\n'
            'case "$1" in\n'
            '  *Username*) printf "%s\\n" "x-access-token" ;;\n'
            '  *Password*) printf "%s\\n" "$PUBLISHER_GITHUB_TOKEN" ;;\n'
            '  *) exit 1 ;;\n'
            'esac\n',
            encoding="utf-8",
        )
        askpass.chmod(0o700)
        env = os.environ.copy()
        env.update({
            "GIT_ASKPASS": str(askpass),
            "GIT_TERMINAL_PROMPT": "0",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_EDITOR": ":",
            "GIT_SEQUENCE_EDITOR": ":",
            "PUBLISHER_GITHUB_TOKEN": token,
        })
        if Path("/opt/libexec/git-core").is_dir():
            env["GIT_EXEC_PATH"] = "/opt/libexec/git-core"
        if Path("/opt/lib").is_dir():
            env["LD_LIBRARY_PATH"] = "/opt/lib:" + env.get("LD_LIBRARY_PATH", "")

        def run(*args: str) -> str:
            return _run(git, list(args), cwd=work, env=env)

        run("init", "--quiet", "--template=")
        run("remote", "add", "origin", remote)
        run(
            "fetch", "--quiet", "--no-tags", "origin",
            "+refs/heads/main:refs/remotes/origin/main",
            f"+refs/heads/{branch}:refs/remotes/origin/source",
        )
        if run("rev-parse", "refs/remotes/origin/main") != base:
            raise Retryable("main changed since Publisher's SHA check")
        if run("rev-parse", "refs/remotes/origin/source") != head:
            raise Retryable("source branch changed since Publisher's SHA check")

        upstream = run("rev-parse", f"{head}~{count}")
        commits = run("rev-list", "--parents", f"{upstream}..{head}").splitlines()
        if len(commits) != count or any(len(line.split()) != 2 for line in commits):
            raise Retryable("owned source suffix contains merge commits or has changed")

        run("switch", "--quiet", "--detach", head)
        run(
            "-c", "user.name=aggregator-publisher",
            "-c", "user.email=aggregator-publisher@users.noreply.github.com",
            "rebase", "--reapply-cherry-picks", "--empty=stop",
            "--onto", base, upstream,
        )
        rewritten = run("rev-parse", "HEAD")
        if rewritten == head:
            raise Retryable("rebase did not rewrite an outdated source branch")
        if int(run("rev-list", "--count", f"{base}..{rewritten}")) != count:
            raise Retryable("rebase changed the expected source commit count")
        run("merge-base", "--is-ancestor", base, rewritten)

        # Check the remote again after the potentially expensive rebase.
        refs = run(
            "ls-remote", "origin", "refs/heads/main", f"refs/heads/{branch}"
        )
        found = {line.split("\t")[1]: line.split("\t")[0] for line in refs.splitlines()}
        if (
            found.get("refs/heads/main") != base
            or found.get(f"refs/heads/{branch}") != head
        ):
            raise Retryable("remote refs changed during rebase; refusing force push")
        run(
            "push", "--quiet",
            f"--force-with-lease=refs/heads/{branch}:{head}",
            "origin", f"HEAD:refs/heads/{branch}",
        )
        return rewritten


def ensure_clean_branch(client, row, record: dict, *, save, now: datetime) -> None:
    """Ensure the PR contains only its own expected commits on current main."""
    branch = row["branch"]
    count = row.get("expected_source_commits")
    if type(count) is not int or not 1 <= count <= 200:
        raise ValueError("invalid expected_source_commits")
    head = client.branch(branch)["commit"]["sha"]
    base = client.branch("main")["commit"]["sha"]
    compare = client.compare(base, head)
    if compare["ahead_by"] == count and compare["behind_by"] == 0:
        return
    if compare["ahead_by"] < count:
        raise Retryable(
            f"source branch {branch} has fewer commits than expected ({count}); "
            "review expected_source_commits"
        )

    rewritten = rebase_source_branch(
        client.repo, branch, head, base, count, client.token,
    )
    actual = client.branch(branch)["commit"]["sha"]
    if actual != rewritten:
        raise Retryable("rebased source head could not be verified through GitHub")
    if client.branch("main")["commit"]["sha"] != base:
        raise Retryable("main moved during rebase; retry before opening or merging PR")
    record["rebase"] = {
        "previous_head": head,
        "main": base,
        "new_head": rewritten,
        "completed_at": now.astimezone(timezone.utc).isoformat(),
    }
    record["head_sha"] = rewritten
    save()
