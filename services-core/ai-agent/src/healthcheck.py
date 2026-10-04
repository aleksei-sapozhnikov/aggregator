"""Container healthcheck for the AI agent service."""

from urllib.request import urlopen

with urlopen("http://localhost:8080/health", timeout=3) as response:
    if response.status != 200:
        raise SystemExit(1)
