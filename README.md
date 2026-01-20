# Catalog health checks

This project demonstrates a simple approach to aggregating service-level health signals into a product-level health view
based on a static catalog definition.

The core idea is that the health state of an item composed of other items is derived deterministically from the states
of its dependencies. For example, a product consists of several services, and the overall product state is calculated
from the states of those services.

## Catalog

The catalog is a storage-agnostic domain model describing items and their relationships.

* **Item**: A catalog entry (for example, product or service) with a stable `ItemId`, name, and type.
* **Dependency**: A directed relationship between two items with an explicit string `type` (for example, `"includes"` or
  `"depends on"`).

### Catalog configuration

The application loads a static catalog definition from the path configured by `catalog.path` (defaults to
`classpath:catalog.yaml`). Both YAML and JSON formats are supported.

See `src/main/resources/catalog.yaml` or `src/main/resources/catalog.json` for examples.

### Example 1: Product includes a service

* `product:payroll-suite` includes `service:payroll-api`

```java
Item payrollApi = Item.of(
        ItemId.of("service:payroll-api"),
        "Payroll API",
        "SERVICE"
);

Item payrollSuite = Item.of(
        ItemId.of("product:payroll-suite"),
        "Payroll Suite",
        "PRODUCT"
);

Dependency payrollSuiteIncludesApi = Dependency.of(
        payrollSuite.getId(),
        payrollApi.getId(),
        "includes"
);
```

### Example 2: Service depends on other services

* `service:web-portal` depends on `service:auth` and `service:billing`

```java
Item webPortal = Item.of(
        ItemId.of("service:web-portal"),
        "Web Portal",
        "SERVICE"
);

Dependency webPortalDependsOnAuth = Dependency.of(
        webPortal.getId(),
        ItemId.of("service:auth"),
        "depends on"
);

Dependency webPortalDependsOnBilling = Dependency.of(
        webPortal.getId(),
        ItemId.of("service:billing"),
        "depends on"
);
```

## Health checks

Health checks define how the system retrieves raw health signals for catalog items.

### Health checks configuration

The application loads health check definitions from the path configured by `health.checks-path` (defaults to
`classpath:health-checks.yaml`).

Definitions are parsed into typed configurations (for example, HTTP checks) and mapped to catalog items via
`catalogItemId`.

### Example 1: HTTP health check targeting a catalog item

```java
HttpHealthCheckConfiguration payrollApiCheck = new HttpHealthCheckConfiguration(
        "payroll-api-http",
        "service:payroll-api",
        "https://payroll.example.com/health",
        "GET",
        Duration.ofSeconds(2),
        List.of(200, 204),
        Duration.ofSeconds(30)
);
```

### Example 2: Minimal HTTP health check with defaults

```java
HttpHealthCheckConfiguration billingCheck = new HttpHealthCheckConfiguration(
        "billing-http",
        "service:billing",
        "https://billing.example.com/health",
        "GET",
        null,
        null,
        null
);
```

## Health aggregation

The health state of a product or service that includes or depends on other items is derived deterministically from the
states of its dependencies.

The aggregator applies the following rules:

* If **any child service is `DOWN`**, the parent is `DOWN`
* Otherwise, if **any child service is `UNKNOWN`**, the parent is `UNKNOWN`
* The parent is `UP` **only if all child services are `UP`**
* Products without child services default to `UNKNOWN` to avoid false positives

## Prometheus metrics

The application exports current catalog item health via Spring Boot Actuator at:

```
/actuator/prometheus
```

Metric names, labels, and semantics are documented in:

`HealthMetricsDocumentation.java`
(`src/main/java/com/github/vermucht/aggregator/health/metrics/HealthMetricsDocumentation.java`)

## Local Prometheus setup (optional)

For local development and verification, the repository includes an optional Prometheus instance that periodically
scrapes the aggregator metrics and stores a short local history on disk.

The Prometheus service is defined in `compose.yaml` and configured to:

* Scrape the aggregator every **10 seconds**
* Read metrics from `/actuator/prometheus`
* Store data locally using Prometheus TSDB
* Limit local storage size and retention to keep the setup lightweight

### Prometheus configuration

The scrape configuration is located at:

```
monitoring/prometheus/prometheus.yml
```

It defines a single scrape job targeting the aggregator service via the Compose network:

```yaml
scrape_configs:
  - job_name: aggregator
    metrics_path: /actuator/prometheus
    static_configs:
      - targets:
          - aggregator:8080
```

### Local data storage

Prometheus stores its data in a local directory mounted from the host:

```
./.temp/prometheus/data
```

This directory is:

* Automatically created by the `Makefile` on startup (including Windows support)
* Ignored by Git (`.gitignore`)
* Used only for local development and PoC verification

The stored data follows the standard Prometheus TSDB layout (WAL, head chunks, blocks), not a single rolling file.

### Accessing Prometheus

Once the stack is running, Prometheus is available at:

```
http://localhost:9090
```

You can use it to:

* Verify that the aggregator target is `UP` (`Status → Targets`)
* Query exported catalog metrics (for example, `catalog_item_state`)
* Query exported catalog dependency edges (for example, `catalog_dependency`)
* Observe how metric values change when dummy services transition between `UP` and `DOWN`

### Example verification

1. Start the stack:
    ```bash
    make up
    ```
2. Open Prometheus UI:

    ```
    http://localhost:9090
    ```

3. Query current catalog item states:

    ```
    catalog_item_state
    ```

   Or more specifically

    ```
    catalog_item_state{item_id=~"user-facing|dummy-javascript"}
    ```

   Or build graph by items

    ```
   avg by (item_id) (catalog_item_state)
   ```

4. Flip a dummy service state and observe the metric change:

   ```bash
   curl http://localhost:8081/set-health/down
   ```

After the next scrape interval, the corresponding `catalog_item_state` metric value will reflect the updated state.

You can also inspect catalog dependencies in Prometheus, for example:

```
catalog_dependency{source_id="user-facing"}
```

![Prometheus - Catalog Dependency Graph](docs/images/prometheus-catalog-dependency.png)

Each dependency is exported as a gauge with labels, for example:

```
catalog_dependency{source_id="user-facing", target_id="dummy-javascript", dep_type="depends_on"} 1
```

Example
- Service `dummy-java` was initially `UP==1.0`, then turned to `DOWN==0.0` and then back again.
- The `user-facing` product depends on `dummy-java` - and follows the same pattern.

![Prometheus catalog item health over time](docs/images/prometheus-catalog-item-state.png)

## Grafana visualization

For catalog item health states visualization, the project includes a preconfigured Grafana instance.
Grafana is connected to Prometheus automatically and provides ready-to-use dashboards without need
for additional configuration.

### Provisioned dashboards

Grafana is provisioned with two dashboards based on the `catalog_item_state` metric:

* **Catalog Item State – Current**
    * Shows the latest known state per catalog item
    * Uses a numeric mapping (`UP = 1`, `DOWN = 0`) with color indication
    * Intended for a quick, high-level overview

  ![Catalog Item State – Current](docs/images/grafana-state-current.png)

* **Catalog Item State – Timeline**
    * Displays state transitions over time
    * Useful for verifying aggregation behavior and change propagation
    * Helps correlate service-level changes with product-level impact

  ![Catalog Item State – Timeline](docs/images/grafana-state-timeline.png)

Both dashboards expose an `item_id` variable populated via:

```
label_values(catalog_item_state, item_id)
```

This allows filtering or comparing specific services and products.

### Local data storage

Grafana stores its local data in a host-mounted directory:

```
./.temp/grafana/data
```

This directory is:

* Automatically created by the `Makefile`
* Ignored by Git
* Used only for local development and verification

### Accessing Grafana

Once the stack is running, Grafana is available at:

```
http://localhost:3000
```

Authentication is disabled for local usage. Grafana starts in anonymous **Viewer** mode, suitable for demos and PoC
validation.

## Dummy services

Standalone dummy services are provided to simulate external health check endpoints during local development and testing.

Each dummy service exposes the following HTTP endpoints:

* `GET /health`

  Returns the current health status:

  ```json
  {
    "status": "UP"
  }
  ```

* `GET /set-health/{up|down}`

  Updates the health status returned by `/health`.

Each dummy service is self-contained and ships with its own Dockerfile under `dummy-services/`:

* `dummy-services/java` (Java)
* `dummy-services/python` (Python)
* `dummy-services/javascript` (JavaScript)

## Local startup with Docker or Podman Compose

The repository ships with a Compose definition that runs the aggregator alongside the three dummy services on the same
network. The aggregator reaches the dummy services via the Compose service names (`dummy-java`, `dummy-python`,
`dummy-javascript`) on port `8080`, matching the URLs in `health-checks.yaml`. The `compose.local.yaml` override enables
the Java remote debugger on port `5005`.

### Prerequisites

* Docker Compose v2 or Podman Compose
* GNU Make (for the `Makefile` targets below)

### Makefile targets

* `make build` - build all images
* `make up` - start the full stack
* `make down` - stop the stack
* `make clean` - remove containers, networks, and volumes created by Compose
* `make restart` - stop the stack, rebuild and start again

### Start the full stack

Use the Makefile to abstract the container runtime:

```bash
make up
```

If you don't have `make` or prefer to call Compose directly:

```bash
docker compose -f compose.yaml -f compose.local.yaml up --detach
```

```bash
podman compose --file compose.yaml --file compose.local.yaml up --detach
```

### Stop or clean the stack

```bash
make down
```

```bash
make clean
```

### Verify the setup

Check that the services are up:

```bash
curl http://localhost:8080/actuator/health
```

```bash
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8083/health
```

Flip a dummy service to `DOWN` and confirm the aggregator reflects it:

```bash
curl http://localhost:8081/set-health/down
curl http://localhost:8080/actuator/health
```

### Local endpoints

* Aggregator: `http://localhost:8080/actuator/health`
* Dummy Java: `http://localhost:8081/health`
* Dummy Python: `http://localhost:8082/health`
* Dummy JavaScript: `http://localhost:8083/health`
