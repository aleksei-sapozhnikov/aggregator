import type { CatalogContact, CatalogItem, ItemSignal } from "../../../shared/types";
import type { ActorSummaryRow } from "../../shared/item/ItemOwnership";
import type { UnhealthyDependencyRow } from "../../shared/item/ItemSignals";

// Local, deterministic fixtures. Nothing here is read from the catalog or APIs.
export const demoIconSpriteHref = `${import.meta.env.BASE_URL}icons.svg`;
export const experienceItem: CatalogItem = { id: "demo-experience", title: "Customer Experience" };
export const experienceContact: CatalogContact = { id: "demo-phone", type: "phone", title: "+1 555 010 2026" };
export const experienceActors: ActorSummaryRow[] = [
  { key: "experience-owner", actor: { id: "experience-owner", title: "Experience Ownership Team", type: "owner" }, typeLabel: "Owner" },
  { key: "experience-user", actor: { id: "experience-user", title: "Customer Care", type: "user" }, typeLabel: "User" },
  { key: "experience-support", actor: { id: "experience-support", title: "Service Desk", type: "other" }, typeLabel: "Support" },
];
export const ordersItem: CatalogItem = { id: "demo-orders", title: "Order Fulfillment" };
export const ordersContact: CatalogContact = { id: "demo-orders-email", type: "email", title: "orders-team@demo.email" };
export const ordersActors: ActorSummaryRow[] = [
  { key: "owner", actor: { id: "owner", title: "Order Platform Team", type: "owner" }, typeLabel: "Owner" },
  { key: "user", actor: { id: "user", title: "Fulfillment Team", type: "user" }, typeLabel: "User" },
  { key: "support", actor: { id: "support", title: "Service Desk", type: "other" }, typeLabel: "Support" },
];
export const clientItem: CatalogItem = { id: "demo-client", title: "client-service" };
export const clientContact: CatalogContact = { id: "demo-client-email", type: "email", title: "support@client-service" };
export const clientChecks: ItemSignal[] = [
  { id: "availability", title: "Availability", status: "up" },
  { id: "success-ratio", title: "Success ratio", status: "up" },
  { id: "latency", title: "Latency", status: "up" },
];
export const clientDependencies: UnhealthyDependencyRow[] = [
  { id: "dep1", title: "client-ux", signals: [{ id: "errors", title: "Error rate", status: "down" }] },
  { id: "nested1", title: "frontend-enabler", signals: [{ id: "readiness", title: "Readiness check", status: "down" }] },
];
export const paymentItem: CatalogItem = { id: "demo-payments", title: "Payment Gateway" };
export const paymentContact: CatalogContact = { id: "demo-finance-email", type: "email", title: "finance-ops@demo.email" };
export const paymentActors: ActorSummaryRow[] = [
  { key: "finance", actor: { id: "finance", title: "Finance Operations", type: "owner" }, typeLabel: "Owner" },
  { key: "checkout", actor: { id: "checkout", title: "Checkout Team", type: "user" }, typeLabel: "User" },
];
export const paymentChecks: ItemSignal[] = ["Readiness", "Availability", "Latency", "Error rate", "Throughput"]
  .map((title, index) => ({ id: `demo-payment-${index}`, title, status: "up" }));
