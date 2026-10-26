"""Open and merge queued pull requests after verifying identity, diff, and reviewed SHA."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from . import milestones, projects
from .github_client import GitHubError


class Deferred(RuntimeError):
    """A gate may become true later without operator intervention."""


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


def _tree(client, ref: str):
    try:
        commit = client.get("/git/commits/" + ref)
        tree = client.get("/git/trees/" + commit["tree"]["sha"] + "?recursive=1")
    except GitHubError as error:
        if error.status == 404:
            raise RuntimeError(
                "Git commit or tree is unavailable by immutable SHA; pause and restore a reviewed reachable ref"
            ) from None
        raise
    if tree.get("truncated"):
        raise RuntimeError("GitHub tree truncated; cannot prove net diff")
    return {
        item["path"]: (item.get("mode", "100644"), item["type"], item["sha"])
        for item in tree["tree"]
        if item["type"] != "tree"
    }


def predecessor_reachability(
    client, dependency_sha: str, head_sha: str, dependency_pr_number: int
) -> str:
    """Prove a saved predecessor commit is still readable after its branch is deleted."""
    try:
        client.get("/git/commits/" + dependency_sha)
    except GitHubError as error:
        if error.status == 404:
            raise RuntimeError(
                "persisted predecessor head commit is unavailable; pause and recover its SHA or retained PR ref"
            ) from None
        raise
    try:
        comparison = client.compare(dependency_sha, head_sha)
    except GitHubError as error:
        if error.status == 404:
            raise RuntimeError(
                "predecessor/head ancestry comparison unavailable; pause and review retained refs"
            ) from None
        raise
    if comparison.get("status") in ("ahead", "identical"):
        return "downstream ancestry"
    try:
        retained = client.get(f"/git/ref/pull/{dependency_pr_number}/head")
    except GitHubError as error:
        if error.status == 404:
            raise RuntimeError(
                "predecessor head is neither downstream ancestry nor a retained PR ref; pause for review"
            ) from None
        raise
    if retained.get("object", {}).get("sha") != dependency_sha:
        raise RuntimeError(
            "predecessor head is neither downstream ancestry nor a matching retained PR ref; pause for review"
        )
    return "retained PR ref"


def verify_net_diff(
    client,
    row: dict,
    pr: dict,
    *,
    dependency_sha: str | None = None,
    dependency_pr_number: int | None = None,
    source_sha: str | None = None,
    dependency_prepared_sha: str | None = None,
    prepared_sha: str | None = None,
):
    """Compare file blob transitions, avoiding ancestry-only differences after squash."""
    if row["depends_on"] == "main":
        main_sha = client.branch("main")["commit"]["sha"]
        main, head = _tree(client, main_sha), _tree(client, pr["head"]["sha"])
        if not {
            path for path in set(main) | set(head) if main.get(path) != head.get(path)
        }:
            raise RuntimeError("first PR has an empty net diff")
        return
    if not dependency_sha or not re.fullmatch(r"[0-9a-fA-F]{40}", dependency_sha):
        raise RuntimeError(
            "predecessor head SHA missing or invalid in durable progress; pause and recover predecessor"
        )
    if not dependency_pr_number:
        raise RuntimeError(
            "predecessor PR number missing in durable progress; pause and recover predecessor"
        )
    predecessor = client.pr(dependency_pr_number)
    if not predecessor.get("merged_at"):
        raise RuntimeError("predecessor PR is not merged; net diff cannot be verified")
    observed_sha = predecessor.get("head", {}).get("sha")
    if observed_sha and observed_sha != (dependency_prepared_sha or dependency_sha):
        raise RuntimeError(
            "persisted predecessor head SHA differs from predecessor PR; pause for review"
        )
    main_sha = client.branch("main")["commit"]["sha"]
    head_sha = pr["head"]["sha"]
    source_sha = source_sha or head_sha
    prepared_comparison = None
    if prepared_sha and prepared_sha != head_sha:
        try:
            prepared_comparison = client.compare(prepared_sha, head_sha)
        except GitHubError as error:
            if error.status != 404:
                raise
        if not prepared_comparison or prepared_comparison.get("status") not in (
            "ahead",
            "identical",
        ):
            comparison = client.compare(main_sha, head_sha)
            base_sha = comparison.get("merge_base_commit", {}).get("sha")
            if not base_sha or not re.fullmatch(r"[0-9a-fA-F]{40}", base_sha):
                raise RuntimeError(
                    "current PR head lacks a verifiable main ancestry base"
                )
            from .rebase import source_commits

            source_commits(client, base_sha, head_sha, 1)
            base, main, head = (
                _tree(client, base_sha),
                _tree(client, main_sha),
                _tree(client, head_sha),
            )
            paths = set(base) | set(main) | set(head)
            intended = {path for path in paths if base.get(path) != head.get(path)}
            actual = {path for path in paths if main.get(path) != head.get(path)}
            if (
                not intended
                or intended != actual
                or any(main.get(path) != base.get(path) for path in intended)
            ):
                raise RuntimeError(
                    "current PR head has unexpected dependencies or conflicts with main"
                )
            return
    predecessor_reachability(client, dependency_sha, source_sha, dependency_pr_number)
    dependency = _tree(client, dependency_sha)
    main, head, source = (
        _tree(client, main_sha),
        _tree(client, head_sha),
        _tree(client, source_sha),
    )
    paths = set(main) | set(dependency) | set(head) | set(source)
    original = {path for path in paths if dependency.get(path) != source.get(path)}
    pushed = set()
    prepared = None
    if prepared_sha and prepared_sha != head_sha:
        prepared = _tree(client, prepared_sha)
        pushed = {
            path
            for path in set(prepared) | set(head)
            if prepared.get(path) != head.get(path)
        }
    expected = original | pushed
    paths |= set(prepared or {})
    actual = {path for path in paths if main.get(path) != head.get(path)}
    if not expected:
        raise RuntimeError(f"empty source delta for {row['branch']}")
    if expected != actual:
        raise RuntimeError(
            f"unexpected net file set for {row['branch']}: extra={sorted(actual - expected)}, missing={sorted(expected - actual)}"
        )
    divergent = [path for path in original if main.get(path) != dependency.get(path)]
    if divergent:
        raise RuntimeError(
            f"main differs from prepared predecessor on touched files: {sorted(divergent)}"
        )
    if prepared is not None:
        changed_base = [
            path for path in pushed - original if main.get(path) != prepared.get(path)
        ]
        if changed_base:
            raise RuntimeError(
                f"main changed newly pushed paths: {sorted(changed_base)}"
            )
    wrong = [path for path in original - pushed if head.get(path) != source.get(path)]
    if wrong:
        raise RuntimeError(f"prepared branch changed source content on {sorted(wrong)}")


def reconcile_associations(
    repo_client, project_client, config, row, pr, *, create_milestone=True
):
    milestone = milestones.ensure_open(
        repo_client, row["release"], existing_pr=pr, create=create_milestone
    )
    milestone_number = milestones.attach(repo_client, pr, milestone)
    project = projects.resolve(project_client, config)
    item_id = projects.ensure(project_client, pr["node_id"], project["id"])
    return {
        "milestone_number": milestone_number,
        "project_item_id": item_id,
        "project_id": project["id"],
    }


def reconcile_associations_best_effort(repo_client, project_client, config, row, pr):
    """Attempt both associations independently without adding a merge gate."""
    from .notifications import sanitize

    result = {}
    try:
        milestone = milestones.ensure_open(repo_client, row["release"], existing_pr=pr)
        result["milestone_number"] = milestones.attach(repo_client, pr, milestone)
    except RuntimeError as error:
        print(
            f"PR #{pr['number']} milestone reconciliation warning: {sanitize(str(error))}"
        )
    try:
        project = projects.resolve(project_client, config)
        result["project_id"] = project["id"]
        result["project_item_id"] = projects.ensure(
            project_client, pr["node_id"], project["id"]
        )
    except RuntimeError as error:
        print(
            f"PR #{pr['number']} Project reconciliation warning: {sanitize(str(error))}"
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
        if known_head and pr["head"].get("sha") != known_head:
            raise RuntimeError(
                "merged PR head SHA differs from durable progress; pause for review"
            )
        # The merge event still verifies the SHA, actual age and squash commit.
        return pr, {}
    if pr["state"] != "open":
        raise RuntimeError(f"PR for {row['branch']} is not open")
    associations = reconcile_associations_best_effort(
        client, project_client, config, row, pr
    )
    return pr, associations


def merge_pr(
    client,
    project_client,
    config,
    row,
    *,
    now: datetime,
    known_head: str | None,
    queue_branches: set[str] | None = None,
    dependency_sha: str | None = None,
    dependency_pr_number: int | None = None,
    known_number: int | None = None,
    source_sha: str | None = None,
    dependency_prepared_sha: str | None = None,
    prepared_sha: str | None = None,
    attempt_sha: str | None = None,
    before_merge=None,
):
    pr = find_exact(client, row, known_number=known_number)
    if not pr:
        raise Deferred("PR not created yet")
    if pr.get("merged_at"):
        if pr["head"].get("sha") != (attempt_sha or known_head):
            raise RuntimeError(
                "merged PR head SHA differs from durable merge attempt; pause for review"
            )
        created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
        merged_at = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
        if merged_at < created + timedelta(
            minutes=config["minimum_actual_open_minutes"]
        ):
            raise RuntimeError("existing merge violated actual 60-minute gate")
        commit = client.get("/commits/" + pr["merge_commit_sha"])
        if len(commit.get("parents", [])) != 1:
            raise RuntimeError("existing merge is not a single-parent squash commit")
        return pr, {
            "head_sha": pr["head"]["sha"],
            "merge_sha": pr["merge_commit_sha"],
            "merged_at": pr["merged_at"],
        }
    if pr["state"] != "open":
        raise RuntimeError("PR closed without merge")
    if queue_branches is not None:
        ensure_only_queue_pr(client, queue_branches, row["branch"])
    created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
    if now.astimezone(timezone.utc) < created + timedelta(
        minutes=config["minimum_actual_open_minutes"]
    ):
        raise Deferred("actual GitHub created_at + 60 minutes not reached")
    # Keep metadata up to date, but GitHub's merge endpoint decides eligibility.
    # Metadata errors are reported as warnings and cannot veto the merge.
    reconcile_associations_best_effort(client, project_client, config, row, pr)
    latest = client.pr(pr["number"])
    _same_repo(latest, client.repo, row["branch"])
    if latest["number"] != pr["number"] or latest.get("state") != "open":
        raise Deferred("PR changed during validation; retry with current state")
    checked_sha = latest["head"]["sha"]
    if before_merge:
        before_merge(checked_sha)
    result = client.put(
        f"/pulls/{pr['number']}/merge", {"merge_method": "squash", "sha": checked_sha}
    )
    if not result.get("merged"):
        raise RuntimeError(
            result.get("message") or "GitHub did not confirm squash merge"
        )
    live = client.pr(pr["number"])
    if (
        not live.get("merged_at")
        or live["merge_commit_sha"] != result["sha"]
        or live["head"]["sha"] != checked_sha
    ):
        raise RuntimeError("merge response and live PR disagree")
    commit = client.get("/commits/" + result["sha"])
    if len(commit.get("parents", [])) != 1:
        raise RuntimeError("merge commit is not a single-parent squash commit")
    return live, {
        "head_sha": checked_sha,
        "merge_sha": result["sha"],
        "merged_at": live["merged_at"],
    }
