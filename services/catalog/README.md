# Catalog service

Go HTTP service that owns the catalog data and the definition of HTTP health
signals. It gives the aggregator, UI, and demo automation one consistent
source for Items, dependencies, actors, contacts, ownership, and checks.
It does **not** determine runtime Product Health.

## Configure catalog data

`catalog/demo/` contains the sample environment, including product
relationships and checks against the dummy services. `catalog/empty/`
contains the minimal alternative. Set `CATALOG_DIR` to a directory with
the complete set of catalog YAML definitions; `CATALOG_SCHEMAS_DIR` points
to the published schemas (default `./schemas`). The server validates required
files and selected field shapes at startup and fails if they are missing or
invalid.

Maintain Item IDs and relation references consistently across definitions.
Use the matching files in `schemas/` as the reference for their shapes.
A schema is published for consumers, but the server's startup checks are
not a full JSON Schema validation pass.

## Run and query

Use `make up` from the repository root for the integrated local demo. Its
catalog API is available at `http://localhost:8084`. For standalone Go
development (Go 1.23 or newer), from this directory:

```sh
go test ./...
CATALOG_DIR=./catalog/demo go run .
```

Standalone mode listens on port 8080 by default; override with `PORT`.
Useful endpoints (replace the port for Compose):

```sh
curl http://localhost:8080/health
curl http://localhost:8080/api/catalog
curl http://localhost:8080/api/catalog/items
curl http://localhost:8080/api/catalog/dependencies
curl http://localhost:8080/api/signals/http-poll
curl http://localhost:8080/api/signals/<signal-id>
```

The API also serves individual actor/contact collections and raw YAML and
schema files. Changes to signal URLs affect both aggregator polling and
[chaos-maker](../chaos-maker/README.md). The Compose demo selects
`catalog/demo`; the base stack uses `catalog/empty`.
