# Demo failure simulator

Python utility used only in demo environments. It discovers controllable
health endpoints from the catalog's HTTP signal definitions, temporarily
marks a selection DOWN, and restores them to UP. This produces changing
signals for testing dependency impact, timelines, and recovery.

## Run

The default `local-demo` Compose stack starts it automatically:

```sh
make up
```

The regular `local` stack does not include the demo services. To turn off
failures in a demo, set `CHAOS_ENABLED=false` in its environment and
recreate the container.

The controls are environment variables:

- `CHAOS_ENABLED`: activate simulation (default false).
- `CATALOG_SIGNALS_URL`: catalog's `/api/signals/http-poll` endpoint
  or a local YAML path.
- `CHAOS_MIN_INTERVAL` / `CHAOS_MAX_INTERVAL`: wait between failures
  (default 30s / 90s).
- `CHAOS_MIN_DURATION` / `CHAOS_MAX_DURATION`: failure window
  (default 20s / 45s).
- `CHAOS_MAX_CONCURRENT`: concurrent failures (default 2).
- `CHAOS_ALWAYS_BROKEN`: demo mode that keeps a failure visible
  (default false).

Durations accept `ms`, `s`, `m`, or `h`. The tool turns
`/health/{id}` into `/set-health/{id}` and requires the demo service's
state-changing HTTP endpoint. **Never run it against production services**:
these endpoints are intentionally unauthenticated test controls.

See [local environments](../../docs/running-locally.md) and
[catalog signal definitions](../catalog/README.md).
