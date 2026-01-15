## Catalog

This module defines a tiny, storage-agnostic domain model for catalog items and their
relationships. The model is intentionally minimal so it is easy to read, hard to misuse,
and ready to extend later without coupling to persistence or transport concerns.

- **Item**: A catalog entry (product or service) with a stable `ItemId`, name, and type.
- **Dependency**: A directed relationship between two items with an explicit
  string `type` (for example `"includes"` or `"depends on"`).

### Catalog configuration

The application loads a static catalog definition from the path configured by
`catalog.path` (defaults to `classpath:catalog.yaml`). Both YAML and JSON formats
are supported; see `src/main/resources/catalog.yaml` or `src/main/resources/catalog.json`
for examples.

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

Dependency payrollSuiteincludesApi = Dependency.of(
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
`health.checks-path` (defaults to `classpath:health-checks.yaml`). Definitions are
parsed into typed configurations (such as HTTP checks) and mapped to catalog items
by `catalogItemId`.

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

Health state of a product or service which includes or depends on others is derived deterministically
using those "children" states too. Aggregator applies simple rules like:

- Any `DOWN` child service makes the parent `DOWN`
- Otherwise, any `UNKNOWN` makes the parent `UNKNOWN`
- And only when all children are `UP`, the parent is also `UP`.
- Products without child services default to `UNKNOWN` to avoid false positives.
