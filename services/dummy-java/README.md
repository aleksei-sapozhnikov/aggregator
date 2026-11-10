# Java dummy service

Small HTTP service used to simulate multiple independent health checks in
the demo catalog. Each health point starts UP and can be changed to DOWN
or back to UP without restarting the process. State is in memory.

Run it as part of the repository's `make up` local demo. The Java service
is exposed at `http://localhost:8081` in that environment.

```sh
curl http://localhost:8081/health/1
curl http://localhost:8081/set-health/1/down
curl http://localhost:8081/health/1
curl http://localhost:8081/set-health/1/up
```

Both endpoints use GET and return `{"status":"UP"}` or
`{"status":"DOWN"}`. The point ID is arbitrary; different IDs do not
affect one another. Restarting resets all points to UP.
The same contract is implemented by the Python and JavaScript dummy
services. These unauthenticated controls are for local/demo use only.
See [demo setup](../../docs/running-locally.md).
