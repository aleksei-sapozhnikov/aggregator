"""Validate a GitHub Project V2 board and attach pull requests without duplicates."""
from __future__ import annotations

from .github_client import Retryable


def resolve(client, config: dict):
    project = config["project"]
    try:
        data = client.graphql("query($owner:String!,$number:Int!){user(login:$owner){projectV2(number:$number){id title url}}}",
                              {"owner": project["owner"], "number": project["number"]})
    except Retryable:
        raise
    except RuntimeError as error:
        raise RuntimeError("Cannot read personal Project V2 #1; check Project token scope: " + str(error)) from error
    found = (data.get("user") or {}).get("projectV2")
    if not found or found["url"].rstrip("/") != project["url"] or not found.get("title"):
        raise RuntimeError("Project V2 #1 inaccessible or URL mismatch; check Project token scope")
    return found


def membership(client, pr_node_id: str, project_id: str):
    data = client.graphql("query($id:ID!){node(id:$id){... on PullRequest{projectItems(first:100){pageInfo{hasNextPage} nodes{id project{id}}}}}}",
                          {"id": pr_node_id})
    connection = ((data.get("node") or {}).get("projectItems") or {})
    if connection.get("pageInfo", {}).get("hasNextPage"):
        raise RuntimeError("PR has more than 100 Project items; cannot prove membership")
    nodes = connection.get("nodes", [])
    for item in nodes:
        if item["project"]["id"] == project_id:
            return item["id"]
    return None


def ensure(client, pr_node_id: str, project_id: str):
    item = membership(client, pr_node_id, project_id)
    if item:
        return item
    try:
        result = client.graphql("mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}",
                                {"project": project_id, "content": pr_node_id}, mutate=True)
    except Retryable:
        raise
    except RuntimeError as error:
        raise RuntimeError("Cannot add PR to personal Project V2; check project token permissions: " + str(error)) from error
    item_id = result["addProjectV2ItemById"]["item"]["id"]
    if membership(client, pr_node_id, project_id) != item_id:
        raise RuntimeError("Project V2 addition not confirmed")
    return item_id
