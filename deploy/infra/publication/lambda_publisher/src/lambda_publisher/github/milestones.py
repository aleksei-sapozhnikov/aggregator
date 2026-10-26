"""Attach pull requests to version milestones and close milestones after release."""
from __future__ import annotations

import re


def semantic(title: str) -> str | None:
    match = re.fullmatch(r"[vV]?(\d+\.\d+\.\d+)", title.strip())
    return match.group(1) if match else None


def matching(client, version: str):
    all_milestones = client.milestones()
    if len(all_milestones) >= 100:
        raise RuntimeError("milestone list may be paginated; cannot prove uniqueness")
    matches = [m for m in all_milestones if semantic(m["title"]) == semantic(version)]
    if len(matches) > 1:
        raise RuntimeError(f"duplicate semantic milestones for {version}")
    return matches[0] if matches else None


def ensure_open(client, version: str, *, existing_pr=None, create=True):
    milestone = matching(client, version)
    if existing_pr and existing_pr.get("milestone"):
        assigned = existing_pr["milestone"]
        if semantic(assigned["title"]) != semantic(version):
            raise RuntimeError(f"PR #{existing_pr['number']} has conflicting milestone")
        if milestone and assigned["number"] != milestone["number"]:
            raise RuntimeError("milestone identity conflict")
        milestone = milestone or assigned
    if milestone and milestone["state"] != "open":
        raise RuntimeError(f"{version} milestone closed too early")
    if not milestone and create:
        milestone = client.post("/milestones", {"title": version, "state": "open"})
    if not milestone:
        raise RuntimeError(f"missing {version} milestone")
    return milestone


def attach(client, pr: dict, milestone: dict):
    assigned = pr.get("milestone")
    if assigned and assigned["number"] != milestone["number"]:
        raise RuntimeError(f"PR #{pr['number']} milestone conflict")
    if not assigned:
        client.patch(f"/issues/{pr['number']}", {"milestone": milestone["number"]})
        confirmed = client.issue(pr["number"])
        if not confirmed.get("milestone") or confirmed["milestone"]["number"] != milestone["number"]:
            raise RuntimeError("milestone assignment not confirmed")
    return milestone["number"]


def close(client, milestone: dict):
    current = matching(client, milestone["title"])
    if current and current["state"] == "closed":
        return current
    return client.patch(f"/milestones/{milestone['number']}", {"state": "closed"})
