# Python dummy service

In-memory simulated HTTP health endpoints for the demo catalog. Every point
starts UP; state can be changed without restarting the service.

Run the repository's `make up` local demo, then use the Python service
at `http://localhost:8082`:

```sh
curl http://localhost:8082/health/1
curl http://localhost:8082/set-health/1/down
curl http://localhost:8082/set-health/1/up
```

Both endpoints use GET and return JSON with a `status` value of UP or
DOWN. IDs are independent, and restarts reset state. The
[chaos-maker](../chaos-maker/README.md) uses these test-only, unauthenticated
controls to simulate failures. Do not expose them as production endpoints.
