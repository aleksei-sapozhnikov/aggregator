"# Catalog health checks

The main idea is that a state of an item which consists of other items, can be
defined by them. For example, one product consists of several services, and each
service state defines the product state.

## Catalog

A storage-agnostic domain model for different items and their relationships.

- **Item**: A catalog entry (product or service) with a stable `ItemId`, name, and type.
- **Dependency**: A directed relationship between two items with an explicit string
  `type` (for example `"includes"` or `"depends on"`).

### Catalog configuration

The application loads a static catalog definition from the path configured by
`catalog.path` (defaults to `classpath:catalog.yaml`). Both YAML and JSON formats
are supported; see `src/main/resources/catalog.yaml` or
`src/main/resources/catalog.json` for examples.

### Example 1: product includes a service

- `product:payroll-suite` includes `service:payroll-api`

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

### Example 2: service depends on other services

- `service:web-portal` depends on `service:auth` and `service:billing`

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

### Health checks configuration

The application loads health check definitions from the path configured by
`health.checks-path` (defaults to `classpath:health-checks.yaml`).
Definitions are parsed into typed configurations (for example, HTTP checks) and
mapped to catalog items via `catalogItemId`.

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

## Health checks aggregation

The health state of a product or service that includes or depends on other items
is derived deterministically from the states of its dependencies.

The aggregator applies simple rules:

- If **any child service is `DOWN`**, the parent is `DOWN`
- Otherwise, if **any child service is `UNKNOWN`**, the parent is `UNKNOWN`
- The parent is `UP` **only if all child services are `UP`**
- Products without child services default to `UNKNOWN` to avoid false positives

## Prometheus health metrics

The application exports current catalog item health via Spring Boot Actuator at
`/actuator/prometheus`.

Further details are documented in:
`HealthMetricsDocumentation.java`
(`src/main/java/com/github/vermucht/aggregator/health/metrics/HealthMetricsDocumentation.java`)

## Dummy services for health simulations

Three standalone dummy services are provided to simulate external health check
endpoints during local development and testing.

Each service exposes the following HTTP endpoints:

- `GET /health`  
  Returns the current health status:
  ```json
  {
    "status": "UP"
  }
  ```

- `GET /set-health/{up|down}`  
  Updates the health status returned by `/health`

Each dummy service is self-contained and ships with its own Dockerfile under
`dummy-services/`:

- `dummy-services/java` (Java)
- `dummy-services/python` (Python)
- `dummy-services/javascript` (JavaScript)
