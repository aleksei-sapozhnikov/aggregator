# Health aggregator

Java / Spring Boot service that turns catalog definitions and service health
checks into deterministic Product Health. This is the calculation boundary:
neither the frontend nor the AI assistant determines UP, DOWN, or UNKNOWN.

## What it does

At startup, the service reads Items, dependencies, and HTTP polling signals from
the [catalog service](../catalog/README.md). It periodically checks the configured
endpoints, records signal states, and propagates dependency impact through the
catalog. It exposes the results as read-only HTTP facts and Prometheus metrics.
A failing dependency can make several parent Items unhealthy without hiding the
underlying signal.

## Run and inspect

The supported integration environment is the repository's Docker Compose stack:

```sh
make up
curl http://localhost:8080/api/product-health/items
curl 'http://localhost:8080/api/product-health/items?unhealthyOnly=true'
curl 'http://localhost:8080/api/product-health/search?query=Operations'
curl http://localhost:8080/actuator/prometheus
```

For exact Item IDs, use `GET /api/product-health/items/{itemId}`. Search
and exact lookup return a structured match result, including ambiguity or
not-found information; the list endpoints return Items. For local Java work,
use JDK 25 and Maven from this directory:

```sh
mvn test
CATALOG_BASE_URL=http://localhost:8084 mvn spring-boot:run
```

The catalog must already be running; the default URL in
`src/main/resources/application.yaml` is `http://catalog:8080` (the
Compose service name). The server listens on port 8080. See
[local setup](../../docs/running-locally.md) for the stack and exposed ports.

## Contracts and diagnostics

- Catalog files and signal definitions are owned by `services/catalog`, not
  edited in this module. Changing their format requires checking both services.
- HTTP checks expect JSON with `status: "UP"` or `status: "DOWN"`.
  Invalid responses and request errors are reported as failing signals.
- Health propagation follows `DOWN > UNKNOWN > UP`; results are facts
  computed here, not UI guesses.
- Prometheus scrapes `/actuator/prometheus`. Grafana consumes those metrics
  for history; it does not calculate live Product Health.

Use the targeted Maven tests before changing aggregation, polling, or API
contracts. Deployment and runtime configuration are managed at repository
level, not by this module.
