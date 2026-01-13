# Catalog domain model (PoC)

This module defines a tiny, storage-agnostic domain model for catalog items and their
relationships. The model is intentionally minimal so it is easy to read, hard to misuse,
and ready to extend later without coupling to persistence or transport concerns.

## Core concepts

- **Item**: A catalog entry (product or service) with a stable `ItemId`, name, and type.
- **Dependency**: A directed relationship between two items with an explicit
  string `type` (for example `"includes"` or `"depends on"`).

## Examples

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
