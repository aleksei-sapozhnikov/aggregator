# JavaScript dummy service

Node.js HTTP simulation of independent service health checks for the demo
catalog. Each point defaults to UP and keeps its overridden state in memory
until the process restarts.

From the repository root, start the `local-demo` stack with `make up`.
The JavaScript service is then available at `http://localhost:8083`:

```sh
curl http://localhost:8083/health/1
curl http://localhost:8083/set-health/1/down
curl http://localhost:8083/set-health/1/up
```

Requests use GET; health and set-health return JSON with `status` UP or
DOWN. Each point ID is separate. These unauthenticated state controls exist
only for testing and the [failure simulator](../chaos-maker/README.md),
not for production use.
