"""Replay a dependent branch by reviewed commit SHA; stop on conflicts or unexpected changes."""

from __future__ import annotations

import re

from .github_client import GitHubError
from .pull_requests import Deferred

SHA = re.compile(r"[0-9a-fA-F]{40}\Z")


def _commit(client, sha):
    if not sha or not SHA.fullmatch(sha):
        raise RuntimeError("missing or invalid immutable source SHA")
    try:
        return client.get("/git/commits/" + sha)
    except GitHubError as error:
        if error.status == 404:
            raise RuntimeError(
                f"Git commit {sha} is unavailable; retain or restore its PR ref before retry"
            ) from None
        raise


def _tree(client, commit):
    response = client.get("/git/trees/" + commit["tree"]["sha"] + "?recursive=1")
    if response.get("truncated"):
        raise RuntimeError("GitHub tree was truncated; cannot verify stacked rebase")
    return {
        item["path"]: (item["mode"], item["type"], item["sha"])
        for item in response["tree"]
        if item["type"] != "tree"
    }


def source_commits(client, base_sha: str, source_sha: str, expected_count: int):
    """Require a linear first-parent chain with at least the planned own commits."""
    _commit(client, base_sha)
    chain = []
    cursor = source_sha
    while cursor != base_sha and len(chain) < 100:
        commit = _commit(client, cursor)
        parents = commit.get("parents", [])
        if len(parents) != 1:
            raise RuntimeError(
                "stacked source contains a merge or missing parent; manual review required"
            )
        chain.append((cursor, commit))
        cursor = parents[0]["sha"]
    if cursor != base_sha or len(chain) < expected_count:
        raise RuntimeError(
            "source branch does not contain its expected own commits after predecessor"
        )
    return list(reversed(chain))


def review_rebase(
    client, *, source_sha: str, predecessor_sha: str, main_sha: str, expected_count: int
) -> dict:
    """Read-only proof that every own commit can be replayed without a path conflict."""
    chain = source_commits(client, predecessor_sha, source_sha, expected_count)
    source_parent = _commit(client, predecessor_sha)
    main = _tree(client, _commit(client, main_sha))
    expected = main.copy()
    changed_any = False
    for _, original in chain:
        before, after = _tree(client, source_parent), _tree(client, original)
        changed = [
            path
            for path in before.keys() | after.keys()
            if before.get(path) != after.get(path)
        ]
        if not changed:
            raise RuntimeError("empty source commit in stacked branch")
        conflicts = [path for path in changed if expected.get(path) != before.get(path)]
        if conflicts:
            raise RuntimeError(
                f"stacked rebase conflict on {sorted(conflicts)}; pause and review"
            )
        for path in changed:
            if path in after:
                expected[path] = after[path]
            else:
                expected.pop(path, None)
        changed_any = True
        source_parent = original
    final = _tree(client, _commit(client, source_sha))
    predecessor = _tree(client, _commit(client, predecessor_sha))
    source_delta = {
        path
        for path in predecessor.keys() | final.keys()
        if predecessor.get(path) != final.get(path)
    }
    prepared_delta = {
        path
        for path in main.keys() | expected.keys()
        if main.get(path) != expected.get(path)
    }
    if not changed_any or not prepared_delta or source_delta != prepared_delta:
        raise RuntimeError("prepared delta is empty or differs from source delta")
    return {
        "changed_paths": sorted(source_delta),
        "source_head_sha": source_sha,
        "predecessor_sha": predecessor_sha,
        "main_sha": main_sha,
    }


def build_rebase(
    client, *, source_sha: str, predecessor_sha: str, main_sha: str, expected_count: int
) -> tuple[str, str]:
    """Create immutable Git objects; never update any ref here."""
    review_rebase(
        client,
        source_sha=source_sha,
        predecessor_sha=predecessor_sha,
        main_sha=main_sha,
        expected_count=expected_count,
    )
    chain = source_commits(client, predecessor_sha, source_sha, expected_count)
    source_parent = _commit(client, predecessor_sha)
    target_parent = _commit(client, main_sha)
    initial = _tree(client, source_parent)
    source_final = _tree(client, _commit(client, source_sha))
    if initial == source_final:
        raise RuntimeError("stacked source delta is empty")
    target = _tree(client, target_parent)
    start_target = target.copy()
    new_parent = main_sha
    for _, original in chain:
        before = _tree(client, source_parent)
        after = _tree(client, original)
        changed = sorted(
            path
            for path in before.keys() | after.keys()
            if before.get(path) != after.get(path)
        )
        if not changed:
            raise RuntimeError("empty source commit in stacked branch")
        conflicts = [path for path in changed if target.get(path) != before.get(path)]
        if conflicts:
            raise RuntimeError(
                f"stacked rebase conflict on {conflicts}; pause and review"
            )
        edits = []
        for path in changed:
            entry = after.get(path)
            if entry is None:
                old = before[path]
                edits.append(
                    {"path": path, "mode": old[0], "type": old[1], "sha": None}
                )
                target.pop(path, None)
            else:
                edits.append(
                    {"path": path, "mode": entry[0], "type": entry[1], "sha": entry[2]}
                )
                target[path] = entry
        created_tree = client.post(
            "/git/trees", {"base_tree": target_parent["tree"]["sha"], "tree": edits}
        )
        new_tree = client.get("/git/trees/" + created_tree["sha"] + "?recursive=1")
        if (
            new_tree.get("truncated")
            or {
                item["path"]: (item["mode"], item["type"], item["sha"])
                for item in new_tree["tree"]
                if item["type"] != "tree"
            }
            != target
        ):
            raise RuntimeError(
                "GitHub-created tree differs from verified source replay"
            )
        created = client.post(
            "/git/commits",
            {
                "message": original["message"],
                "tree": created_tree["sha"],
                "parents": [new_parent],
            },
        )
        if created.get("tree", {}).get("sha") != created_tree["sha"] or [
            parent["sha"] for parent in created.get("parents", [])
        ] != [new_parent]:
            raise RuntimeError(
                "GitHub-created commit differs from requested parent or tree"
            )
        new_parent = created["sha"]
        target_parent = created
        source_parent = original
    intended = {
        path
        for path in initial.keys() | source_final.keys()
        if initial.get(path) != source_final.get(path)
    }
    actual = {
        path
        for path in start_target.keys() | target.keys()
        if start_target.get(path) != target.get(path)
    }
    if (
        not actual
        or actual != intended
        or any(target[path] != source_final[path] for path in actual if path in target)
    ):
        raise RuntimeError("prepared branch delta differs from original source delta")
    return new_parent, target_parent["tree"]["sha"]


def update_branch_with_lease(client, branch: str, old_sha: str, new_sha: str):
    """GraphQL updateRefs.beforeOid is the server-side force-with-lease check."""
    if not SHA.fullmatch(old_sha) or not SHA.fullmatch(new_sha) or old_sha == new_sha:
        raise RuntimeError("invalid branch SHA transition")
    metadata = client.get("")
    try:
        result = client.graphql(
            """mutation($input: UpdateRefsInput!) {
          updateRefs(input: $input) { clientMutationId }
        }""",
            {
                "input": {
                    "repositoryId": metadata["node_id"],
                    "refUpdates": [
                        {
                            "name": "refs/heads/" + branch,
                            "beforeOid": old_sha,
                            "afterOid": new_sha,
                            "force": True,
                        }
                    ],
                }
            },
            mutate=True,
        )
    except (GitHubError, RuntimeError):
        if client.branch(branch)["commit"]["sha"] != old_sha:
            raise Deferred(
                "source branch changed during leased update; retry preparation"
            ) from None
        raise
    if "updateRefs" not in result:
        raise RuntimeError("GitHub did not confirm leased branch update")
    if client.branch(branch)["commit"]["sha"] != new_sha:
        raise RuntimeError("branch head differs after leased update; pause and inspect")


def _branch_sha(client, branch: str) -> str | None:
    try:
        return client.branch(branch)["commit"]["sha"]
    except GitHubError as error:
        if error.status == 404:
            return None
        raise


def prepare(client, row, record, predecessor_record, *, save):
    """Persist source/candidate before mutation so an interrupted update is recoverable."""
    live_sha = client.branch(row["branch"])["commit"]["sha"]
    if record.get("prepared_head_sha"):
        prepared_sha = record["prepared_head_sha"]
        if (
            record.get("prepared_main_sha")
            and client.branch("main")["commit"]["sha"] != record["prepared_main_sha"]
        ):
            raise RuntimeError(
                "main advanced after branch preparation; pause and review"
            )
        if live_sha == record["prepared_head_sha"]:
            return live_sha
        try:
            source_commits(client, prepared_sha, live_sha, 1)
        except RuntimeError:
            pass
        else:
            record["head_sha"] = live_sha
            save()
            return live_sha
        for key in (
            "prepared_head_sha",
            "prepared_candidate_sha",
            "prepared_tree_sha",
            "prepared_main_sha",
        ):
            record.pop(key, None)
    candidate = record.get("prepared_candidate_sha")
    if candidate and live_sha == candidate:
        if client.branch("main")["commit"]["sha"] != record.get("prepared_main_sha"):
            raise RuntimeError(
                "main advanced after interrupted branch update; pause and review"
            )
        record["prepared_head_sha"] = candidate
        record["head_sha"] = candidate
        save()
        return candidate
    source_sha = live_sha
    if not predecessor_record.get("head_sha") or not predecessor_record.get(
        "merge_sha"
    ):
        raise RuntimeError(
            "predecessor original head or merge SHA missing in durable progress"
        )
    _commit(client, predecessor_record["head_sha"])
    live_predecessor = _branch_sha(client, row["depends_on"])
    if live_predecessor and live_predecessor != predecessor_record["head_sha"]:
        raise RuntimeError("predecessor branch differs from its merged PR head")
    bases = dict.fromkeys(
        (
            live_predecessor,
            predecessor_record["head_sha"],
            predecessor_record.get("source_head_sha"),
        )
    )
    predecessor_sha = None
    for base_sha in bases:
        if not base_sha:
            continue
        try:
            source_commits(client, base_sha, source_sha, row["expected_source_commits"])
        except RuntimeError:
            continue
        predecessor_sha = base_sha
        break
    if not predecessor_sha:
        raise RuntimeError(
            "source branch does not descend from the current or recorded predecessor"
        )
    if (
        record.get("source_head_sha") != source_sha
        or record.get("source_base_sha") != predecessor_sha
        or record.get("prepared_main_sha") != client.branch("main")["commit"]["sha"]
    ):
        for key in ("prepared_candidate_sha", "prepared_tree_sha", "prepared_main_sha"):
            record.pop(key, None)
    record["source_head_sha"] = source_sha
    record["source_base_sha"] = predecessor_sha
    main_sha = client.branch("main")["commit"]["sha"]
    save()
    candidate = record.get("prepared_candidate_sha")
    if not candidate:
        new_sha, tree_sha = build_rebase(
            client,
            source_sha=source_sha,
            predecessor_sha=predecessor_sha,
            main_sha=main_sha,
            expected_count=row["expected_source_commits"],
        )
        record.update(
            {
                "prepared_candidate_sha": new_sha,
                "prepared_tree_sha": tree_sha,
                "prepared_main_sha": main_sha,
            }
        )
        save()
        candidate = new_sha
    if live_sha != source_sha:
        raise Deferred("source branch changed before leased update; retry preparation")
    if client.branch("main")["commit"]["sha"] != main_sha:
        raise Deferred("main advanced before leased branch update; retry preparation")
    if _branch_sha(client, row["depends_on"]) != live_predecessor:
        raise Deferred("predecessor branch changed during preparation; retry")
    update_branch_with_lease(client, row["branch"], source_sha, candidate)
    record["prepared_head_sha"] = candidate
    record["head_sha"] = candidate
    save()
    return candidate
