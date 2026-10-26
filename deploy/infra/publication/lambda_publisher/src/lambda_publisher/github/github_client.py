"""GitHub REST and GraphQL client with read retries and explicit mutation handling."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request


class Retryable(RuntimeError):
    pass


class GitHubError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"GitHub HTTP {status}: {message[:350]}")
        self.status = status


class GitHub:
    def __init__(self, token: str, repo: str, opener=None):
        self.token = token
        self.repo = repo
        self.opener = opener or urllib.request.urlopen
        self.base = f"https://api.github.com/repos/{repo}"

    def request(self, method: str, path: str, payload=None, *, graphql=False):
        url = "https://api.github.com/graphql" if graphql else self.base + path
        body = None if payload is None else json.dumps(payload).encode()
        headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {self.token}",
                   "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aggregator-publication-runner"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=body, headers=headers, method=method)
        for attempt in range(3 if method == "GET" else 1):
            try:
                with self.opener(request, timeout=25) as response:
                    raw = response.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as error:
                text = error.read(1000).decode("utf-8", "replace")
                if method == "GET" and error.code in (429, 500, 502, 503, 504) and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                if error.code in (429, 500, 502, 503, 504) or (error.code == 403 and "rate limit" in text.lower()):
                    raise Retryable(f"GitHub HTTP {error.code}; reconcile live state before retry") from None
                raise GitHubError(error.code, text) from None
            except (urllib.error.URLError, TimeoutError) as error:
                raise Retryable("GitHub transport failed; reconcile live state before retry") from error
        raise RuntimeError("unreachable")

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, payload):
        return self.request("POST", path, payload)

    def patch(self, path, payload):
        return self.request("PATCH", path, payload)

    def put(self, path, payload):
        return self.request("PUT", path, payload)

    def graphql(self, query: str, variables: dict, *, mutate=False):
        result = self.request("POST", "", {"query": query, "variables": variables}, graphql=True)
        if result.get("errors"):
            raise RuntimeError("GitHub GraphQL: " + "; ".join(e.get("message", "unknown") for e in result["errors"])[:300])
        return result["data"]

    def identity(self):
        # /user is outside the repository path.
        return self.request_absolute("GET", "https://api.github.com/user")

    def request_absolute(self, method, url):
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {self.token}", "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "aggregator-publication-runner"}, method=method)
        try:
            with self.opener(request, timeout=25) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise GitHubError(error.code, error.read(1000).decode("utf-8", "replace")) from None

    def pr(self, number: int):
        return self.get(f"/pulls/{number}")

    def issue(self, number: int):
        return self.get(f"/issues/{number}")

    def find_prs(self, branch: str) -> list[dict]:
        owner = self.repo.split("/")[0]
        query = urllib.parse.urlencode({"state": "all", "head": f"{owner}:{branch}", "base": "main", "per_page": 100})
        return self.get(f"/pulls?{query}")

    def open_pulls(self):
        return self.get("/pulls?state=open&per_page=100")

    def branch(self, branch: str):
        return self.get("/branches/" + urllib.parse.quote(branch, safe=""))

    def rulesets(self):
        return self.get("/rulesets?includes_parents=true&per_page=100")

    def checks(self, sha: str):
        return self.get(f"/commits/{sha}/check-runs?per_page=100")

    def status(self, sha: str):
        return self.get(f"/commits/{sha}/status")

    def reviews(self, number: int):
        return self.get(f"/pulls/{number}/reviews?per_page=100")

    def files(self, number: int):
        return self.get(f"/pulls/{number}/files?per_page=100")

    def compare(self, base: str, head: str):
        return self.get("/compare/" + urllib.parse.quote(base, safe="") + "..." + urllib.parse.quote(head, safe=""))

    def milestones(self):
        return self.get("/milestones?state=all&per_page=100")

    def release_by_tag(self, tag: str):
        try:
            return self.get("/releases/tags/" + tag)
        except GitHubError as error:
            if error.status == 404:
                return None
            raise

    def tag_ref(self, tag: str):
        try:
            return self.get("/git/ref/tags/" + tag)
        except GitHubError as error:
            if error.status == 404:
                return None
            raise
