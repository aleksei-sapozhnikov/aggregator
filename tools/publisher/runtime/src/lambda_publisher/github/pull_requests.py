"""Open and merge queued pull requests through GitHub, retaining queue order."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import time

from . import milestones, projects
from .github_client import GitHubError


class Deferred(RuntimeError):
    """A gate may become true later without operator intervention."""


class MergeNotReady(Deferred):
    """GitHub declined merging the PR; retry when its merge conditions change."""


def _matches_repo(pr: dict, repo: str, branch: str):
    head = pr["head"]
    head_repo = head.get("repo")
    base_repo = pr["base"].get("repo")
    return (
        pr["base"]["ref"] == "main"
        and head["ref"] == branch
        and (not base_repo or base_repo.get("full_name") == repo)
        and (not head_repo or head_repo.get("full_name") == repo)
    )


def _same_repo(pr: dict, repo: str, branch: str):
    if not _matches_repo(pr, repo, branch) or (
        not pr["head"].get("repo") and not pr.get("merged_at")
    ):
        raise RuntimeError(f"PR #{pr['number']} head/base/repository mismatch")


def _pr_time(pr: dict, field: str):
    try:
        value = datetime.fromisoformat(pr[field].replace("Z", "+00:00"))
        if value.utcoffset() is not None:
            return value
    except (KeyError, TypeError, ValueError, AttributeError):
        pass
    raise RuntimeError(
        f"PR #{pr['number']} has missing/invalid {field}; inspect GitHub while paused"
    )


def _for_open(pr: dict, *, scheduled_at: datetime, tracked: bool):
    """Only an untracked closure strictly before this event is historical."""
    if pr.get("merged_at"):
        created, merged = _pr_time(pr, "created_at"), _pr_time(pr, "merged_at")
        if pr["state"] != "closed" or merged < created:
            raise RuntimeError(
                f"PR #{pr['number']} has conflicting merge state; inspect GitHub while paused"
            )
        if not tracked:
            if merged < scheduled_at:
                return None
            if created < scheduled_at:
                raise RuntimeError(
                    f"merged PR #{pr['number']} predates scheduled publication; "
                    "reconcile its queue PR identity while paused"
                )
        return pr
    if pr["state"] == "open":
        return pr
    if pr["state"] == "closed":
        closed, created = _pr_time(pr, "closed_at"), _pr_time(pr, "created_at")
        if closed < created:
            raise RuntimeError(
                f"PR #{pr['number']} has conflicting closure times; inspect GitHub while paused"
            )
        if not tracked and closed < scheduled_at:
            return None
        raise RuntimeError(
            f"PR #{pr['number']} closed without merge for the current publication; "
            "never recreate automatically; reconcile cancellation while paused"
        )
    raise RuntimeError(
        f"PR #{pr['number']} has unknown state; inspect GitHub while paused"
    )


def find_exact(
    client,
    row: dict,
    *,
    known_number: int | None = None,
    scheduled_at: datetime | None = None,
):
    # scheduled_at is supplied only by open_pr. Merge discovery remains strict.
    if scheduled_at is not None and scheduled_at.utcoffset() is None:
        raise RuntimeError("scheduled publication time must include a timezone")
    existing = row.get("existing") or (
        {"number": row["existing_pr_number"]} if row.get("existing_pr_number") else None
    )
    if existing and known_number and existing["number"] != known_number:
        raise RuntimeError(
            "reviewed and persisted PR numbers conflict; reconcile queue identity while paused"
        )
    if existing:
        pr = client.pr(existing["number"])
        if pr["number"] != existing["number"]:
            raise RuntimeError("reviewed PR number differs from live response")
        _same_repo(pr, client.repo, row["branch"])
        return (
            _for_open(pr, scheduled_at=scheduled_at, tracked=True)
            if scheduled_at is not None
            else pr
        )
    if known_number:
        pr = client.pr(known_number)
        if pr["number"] != known_number:
            raise RuntimeError("persisted PR number differs from live response")
        _same_repo(pr, client.repo, row["branch"])
        return (
            _for_open(pr, scheduled_at=scheduled_at, tracked=True)
            if scheduled_at is not None
            else pr
        )
    matches = client.find_prs(row["branch"])
    if len(matches) >= 100:
        raise RuntimeError(
            f"PR history for {row['branch']} may be paginated; inspect all pages while paused"
        )
    if scheduled_at is not None:
        candidates = []
        for match in matches:
            if not _matches_repo(match, client.repo, row["branch"]):
                continue
            pr = client.pr(match["number"])
            if pr["number"] != match["number"]:
                raise RuntimeError("discovered PR number differs from live response")
            _same_repo(pr, client.repo, row["branch"])
            current = _for_open(pr, scheduled_at=scheduled_at, tracked=False)
            if current is not None:
                candidates.append(current)
        if len(candidates) > 1:
            raise RuntimeError(
                f"multiple current PRs for {row['branch']}: "
                f"{[pr['number'] for pr in candidates]}; reconcile queue identity while paused"
            )
        return candidates[0] if candidates else None
    if len(matches) > 1:
        raise RuntimeError(f"multiple PRs for {row['branch']}")
    if not matches:
        return None
    pr = client.pr(matches[0]["number"])
    if pr["number"] != matches[0]["number"]:
        raise RuntimeError("discovered PR number differs from live response")
    _same_repo(pr, client.repo, row["branch"])
    if pr["state"] == "closed" and not pr.get("merged_at"):
        raise RuntimeError(f"unmerged closed PR for {row['branch']}")
    return pr


def ensure_only_queue_pr(
    client, queue_branches: set[str], branch: str, *, exact_identity=False
):
    opened = client.open_pulls()
    if len(opened) >= 100:
        raise RuntimeError("open PR list paginated; cannot prove queue concurrency")
    conflicts = [
        pr["head"]["ref"]
        for pr in opened
        if pr["head"]["ref"] in queue_branches
        and pr["head"]["ref"] != branch
        and (not exact_identity or _matches_repo(pr, client.repo, pr["head"]["ref"]))
    ]
    if conflicts:
        raise RuntimeError(f"another queue PR is open: {conflicts}")


def reconcile_associations_best_effort(
    repo_client, project_client, config, row, pr, *, attach_milestone=True
):
    """Attempt both associations independently without adding a merge gate."""
    result = {}
    milestone_name = row.get("milestone") or row.get("release")
    if attach_milestone and milestone_name:
        try:
            milestone = milestones.ensure_open(
                repo_client, milestone_name, existing_pr=pr
            )
            result["milestone_number"] = milestones.attach(
                repo_client, pr, milestone
            )
        except Exception as error:
            print(
                f"PR #{pr['number']} milestone reconciliation warning: {type(error).__name__}"
            )
    try:
        if config.get("expected_actor") and (
            project_client.identity()["login"] != config["expected_actor"]
        ):
            raise RuntimeError("Project PAT actor mismatch")
        project = projects.resolve(project_client, config)
        result["project_id"] = project["id"]
        result["project_item_id"] = projects.ensure(
            project_client, pr["node_id"], project["id"]
        )
    except Exception as error:
        print(
            f"PR #{pr['number']} Project reconciliation warning: {type(error).__name__}"
        )
    return result


def open_pr(
    client,
    project_client,
    config,
    row,
    *,
    queue_branches: set[str] | None = None,
    known_number: int | None = None,
    scheduled_at: datetime | None = None,
    known_head: str | None = None,
):
    if queue_branches is not None:
        ensure_only_queue_pr(client, queue_branches, row["branch"], exact_identity=True)
    pr = find_exact(client, row, known_number=known_number, scheduled_at=scheduled_at)
    if pr is None:
        if row.get("existing"):
            raise RuntimeError("existing PR missing; never recreate")
        client.branch(row["branch"])
        pr = client.post(
            "/pulls",
            {
                "title": row["title"],
                "body": row["body"],
                "head": row["branch"],
                "base": "main",
                "draft": False,
            },
        )
    _same_repo(pr, client.repo, row["branch"])
    if pr.get("merged_at"):
        return pr, {}
    if pr["state"] != "open":
        raise RuntimeError(f"PR for {row['branch']} is not open")
    # PR identity is persisted by the runner before optional metadata work.
    return pr, {}



BRANCH_UPDATE_TIMEOUT_SECONDS = 30
BRANCH_UPDATE_POLL_SECONDS = 3


class MergeRejected(MergeNotReady):
    """The GitHub merge endpoint rejected the request."""

    def __init__(self, status: int):
        super().__init__(f"GitHub rejected the merge (HTTP {status})")
        self.status = status


def _merged_record(pr):
    return pr, {
        "head_sha": pr["head"]["sha"],
        "merge_sha": pr["merge_commit_sha"],
        "merged_at": pr["merged_at"],
    }


def _squash_merge(client, pr, row, before_merge):
    """Ask GitHub to merge this exact PR head, without local gate checks."""
    sha = pr["head"]["sha"]
    if before_merge:
        before_merge(sha)
    try:
        result = client.put(
            f"/pulls/{pr['number']}/merge",
            {"merge_method": "squash", "sha": sha},
        )
    except GitHubError as error:
        if error.status in (405, 409, 422):
            raise MergeRejected(error.status) from None
        raise
    if not result.get("merged"):
        raise MergeNotReady("GitHub did not allow the merge yet")
    live = client.pr(pr["number"])
    _same_repo(live, client.repo, row["branch"])
    if (
        not live.get("merged_at")
        or live["merge_commit_sha"] != result["sha"]
        or live["head"]["sha"] != sha
    ):
        raise RuntimeError("merge response and live PR disagree")
    return _merged_record(live)


def _wait_for_updated_head(client, number, row, original_sha):
    """Wait no longer than the configured budget for the accepted branch update."""
    deadline = time.monotonic() + BRANCH_UPDATE_TIMEOUT_SECONDS
    while True:
        updated = client.pr(number)
        _same_repo(updated, client.repo, row["branch"])
        if updated["number"] != number:
            raise RuntimeError("PR identity changed during branch update")
        if updated.get("merged_at"):
            return updated
        if updated["state"] != "open":
            raise MergeNotReady("PR closed while waiting for branch update")
        if updated["head"]["sha"] != original_sha:
            return updated
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise MergeNotReady("GitHub branch update still pending after 30 seconds")
        time.sleep(min(BRANCH_UPDATE_POLL_SECONDS, remaining))


def merge_pr(
    client,
    project_client,
    config,
    row,
    *,
    now: datetime,
    known_head: str | None,
    queue_branches: set[str] | None = None,
    known_number: int | None = None,
    before_merge=None,
):
    pr = find_exact(client, row, known_number=known_number)
    if not pr:
        raise Deferred("PR not created yet")
    if pr.get("merged_at"):
        return _merged_record(pr)
    if pr["state"] != "open":
        raise RuntimeError("PR closed without merge")
    if queue_branches is not None:
        ensure_only_queue_pr(client, queue_branches, row["branch"])
    created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
    if now.astimezone(timezone.utc) < created + timedelta(
        minutes=config["minimum_actual_open_minutes"]
    ):
        raise Deferred("actual GitHub created_at + 60 minutes not reached")

    latest = client.pr(pr["number"])
    _same_repo(latest, client.repo, row["branch"])
    if latest["number"] != pr["number"]:
        raise RuntimeError("PR identity changed during merge validation")
    if latest.get("merged_at"):
        return _merged_record(latest)
    if latest["state"] != "open":
        raise Deferred("PR changed during merge validation; retry with current state")

    try:
        return _squash_merge(client, latest, row, before_merge)
    except MergeRejected as error:
        # GitHub makes the merge decision. Only 'behind' identifies a
        # rejection that a branch update may actually resolve.
        refreshed = client.pr(pr["number"])
        _same_repo(refreshed, client.repo, row["branch"])
        if refreshed["number"] != pr["number"]:
            raise RuntimeError("PR identity changed after merge rejection")
        if refreshed.get("merged_at"):
            return _merged_record(refreshed)
        if refreshed["state"] != "open":
            raise MergeNotReady("PR is no longer open after merge rejection")
        if refreshed["head"]["sha"] != latest["head"]["sha"]:
            raise MergeNotReady("PR head changed during merge; retry with latest SHA")
        if row.get("source_mode") == "new" and row.get("expected_source_commits"):
            # Never add a Git merge commit to a prepared publication branch.
            # The next watchdog run performs a clean, owned-commit rebase.
            raise MergeNotReady(
                f"GitHub rejected merge (HTTP {error.status}); "
                "recheck and rebase the queued branch on the next invocation"
            ) from None
        if refreshed.get("mergeable_state") != "behind":
            raise MergeNotReady(
                f"GitHub rejected the merge (HTTP {error.status}); "
                "branch update is not indicated"
            ) from None

    # One update request per invocation; never overwrite a newer head.
    original_sha = refreshed["head"]["sha"]
    try:
        client.put(
            f"/pulls/{pr['number']}/update-branch",
            {"expected_head_sha": original_sha},
        )
    except GitHubError as error:
        if error.status == 422:
            current = client.pr(pr["number"])
            _same_repo(current, client.repo, row["branch"])
            if current.get("merged_at"):
                return _merged_record(current)
            if current["head"]["sha"] != original_sha:
                raise MergeNotReady("PR head changed before update; retry") from None
        raise MergeNotReady(
            f"GitHub rejected automatic branch update (HTTP {error.status})"
        ) from None

    updated = _wait_for_updated_head(client, pr["number"], row, original_sha)
    if updated.get("merged_at"):
        return _merged_record(updated)
    try:
        return _squash_merge(client, updated, row, before_merge)
    except MergeRejected as error:
        # Do not request another update in this Lambda invocation.
        raise MergeNotReady(
            f"GitHub rejected merge after branch update (HTTP {error.status}); retry later"
        ) from None
