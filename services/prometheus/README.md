# Prometheus metrics collection

Prometheus scrapes the aggregator's `/actuator/prometheus` endpoint every
10 seconds. It stores the resulting health metrics for timelines and for
Grafana dashboards. Live Product Health is calculated in the Java
[aggregator](../aggregator/README.md), not in Prometheus.

## Use

Run `make up` from the repository root and open
`http://localhost:9090` for the local Prometheus UI. The scrape target is
`aggregator:8080` on the Compose network. Check **Status / Targets** if a
dashboard is empty; verify `http://localhost:8080/actuator/prometheus`
from the host.

Change scrape settings in `prometheus.yml` and recreate the Prometheus
container. The Compose setup mounts this file read-only. Local Compose
retention is set in `deploy/compose/compose.yaml` (1 hour or 50 MB);
the separate K3s setup has its own retention and persistent storage
configuration under `deploy/kubernetes`. Do not assume demo history is
durable.

See [Grafana](../grafana/README.md) for visualization and
[local setup](../../docs/running-locally.md) for service access.
