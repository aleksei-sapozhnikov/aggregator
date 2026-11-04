"""Find and optionally delete local branches already squash-merged into main.

The script checks each local branch except main and the current branch. For each
branch it creates a temporary detached worktree at main, squash-merges the
branch there, and treats the branch as deletable only when that produces no
staged or working tree diff.

After showing the deletable branches, it asks for confirmation. Only the exact
answer "yes" deletes branches.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from collections.abc import Sequence
from pathlib import Path

BASE_BRANCH = "main"


def run_git(
    arguments: Sequence[str],
    *,
    cwd: Path | None = None,
    allowed_returncodes: set[int] | None = None,
) -> subprocess.CompletedProcess[str]:
    """Run git and return the completed process.

    Some git commands use meaningful non-zero exit codes, so callers can pass
    the allowed set explicitly.
    """
    allowed = allowed_returncodes if allowed_returncodes is not None else {0}
    result = subprocess.run(
        ["git", *arguments],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode not in allowed:
        command = " ".join(["git", *arguments])
        output = (result.stderr or result.stdout).strip()
        print(
            f"error: {command} failed with exit code {result.returncode}",
            file=sys.stderr,
        )
        if output:
            print(output, file=sys.stderr)
        raise SystemExit(result.returncode)
    return result


def first_trimmed_line(text: str) -> str:
    """Return the first output line trimmed, or an empty string."""
    lines = text.splitlines()
    if not lines:
        return ""
    return lines[0].strip()


def repo_root() -> Path:
    """Return the current git repository root."""
    result = run_git(["rev-parse", "--show-toplevel"])
    return Path(first_trimmed_line(result.stdout))


def local_branches(repo: Path) -> list[str]:
    """Return short names of all local branches."""
    result = run_git(
        ["for-each-ref", "refs/heads", "--format=%(refname:short)"],
        cwd=repo,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def current_branch(repo: Path) -> str:
    """Return the checked-out branch name, or an empty string if detached."""
    result = run_git(["branch", "--show-current"], cwd=repo)
    return first_trimmed_line(result.stdout)


def find_deletable_branches(repo: Path) -> list[str]:
    """Find branches whose squash merge into main produces an empty diff."""
    current = current_branch(repo)
    base_sha = first_trimmed_line(run_git(["rev-parse", BASE_BRANCH], cwd=repo).stdout)
    worktree = Path(tempfile.mkdtemp(prefix="git-prune-"))
    worktree.rmdir()

    candidates: list[str] = []
    try:
        run_git(
            ["worktree", "add", "--detach", str(worktree), base_sha, "--quiet"],
            cwd=repo,
        )
        for branch in local_branches(repo):
            if branch == BASE_BRANCH or (current and branch == current):
                continue

            run_git(["reset", "--hard", base_sha, "--quiet"], cwd=worktree)
            run_git(["clean", "-fd", "--quiet"], cwd=worktree)

            merge_result = run_git(
                ["merge", "--squash", "--no-commit", branch],
                cwd=worktree,
                allowed_returncodes={0, 1},
            )
            if merge_result.returncode != 0:
                continue

            cached_diff = run_git(
                ["diff", "--cached", "--quiet"],
                cwd=worktree,
                allowed_returncodes={0, 1},
            )
            worktree_diff = run_git(
                ["diff", "--quiet"],
                cwd=worktree,
                allowed_returncodes={0, 1},
            )
            if cached_diff.returncode == 0 and worktree_diff.returncode == 0:
                candidates.append(branch)
    finally:
        if worktree.exists():
            run_git(
                ["worktree", "remove", "--force", str(worktree)],
                cwd=repo,
                allowed_returncodes={0, 128},
            )
            shutil.rmtree(worktree, ignore_errors=True)

    return candidates


def confirm_delete() -> bool:
    """Ask for deletion confirmation. Only the exact answer yes proceeds."""
    return input("Delete these branches? Type yes to proceed: ") == "yes"


def delete_branches(repo: Path, branches: Sequence[str]) -> None:
    """Delete the already-confirmed branch list without recomputing it."""
    for branch in branches:
        print(f"Deleting local branch: {branch}")
        run_git(["branch", "-D", "--", branch], cwd=repo)


def main() -> int:
    """Find deletable branches, ask for confirmation, and delete if confirmed."""
    repo = repo_root()
    candidates = find_deletable_branches(repo)
    if not candidates:
        print("No squashed local branches can be safely deleted.")
        return 0

    print("These branches were merged and can be deleted:")
    print()
    for branch in candidates:
        print(f"  {branch}")
    print()

    if not confirm_delete():
        print("No branches were deleted.")
        return 0

    delete_branches(repo, candidates)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
