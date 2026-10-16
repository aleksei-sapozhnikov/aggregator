/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalogTree, findNodeByPath } from "../../shared/catalog/tree";
import type {
  CatalogActor,
  CatalogActorContact,
  CatalogContact,
  CatalogDependency,
  CatalogItem,
  CatalogItemActor,
  HealthStatus,
  ItemSignal,
} from "../../shared/types";
import useSelectedItemData from "./useSelectedItemData";

const items: CatalogItem[] = [
  { id: "suite", title: "Operations Suite" },
  { id: "alpha", title: "Alpha" },
  { id: "beta", title: "Beta" },
  { id: "db", title: "Database" },
];
const dependencies: CatalogDependency[] = [
  { sourceId: "suite", targetId: "alpha" },
  { sourceId: "suite", targetId: "beta" },
  { sourceId: "alpha", targetId: "db" },
  { sourceId: "beta", targetId: "db" },
];
const tree = buildCatalogTree(items, dependencies);
const suiteNode = findNodeByPath(tree, ["suite"]);
const itemMap = new Map(items.map((item) => [item.id, item]));
const contacts: CatalogContact[] = [
  { id: "email", title: "Email", type: "email" },
  { id: "phone", title: "Phone", type: "phone" },
];
const actors: CatalogActor[] = [
  { id: "viewer", title: "Stakeholder", type: "user" },
  { id: "owner", title: "Operations Team", type: "owner" },
];
const itemActors: CatalogItemActor[] = [
  { itemId: "suite", actorId: "viewer", isPrimary: true },
  { itemId: "suite", actorId: "owner" },
];
const actorContacts: CatalogActorContact[] = [
  { actorId: "owner", contactId: "email" },
  { actorId: "owner", contactId: "phone", isPrimary: true },
  { actorId: "owner", contactId: "missing", isPrimary: true },
];
const catalog = { contacts, actors, itemActors, actorContacts };

const itemStatuses: Record<string, HealthStatus> = { suite: "up" };
const itemSignals: Record<string, ItemSignal[]> = {
  suite: [
    { id: "healthy", title: "Availability", status: "up" },
    { id: "unknown", title: "Capacity", status: "unknown" },
    { id: "slow", title: "Latency", status: "down" },
    { id: "errors", title: "Errors", status: "down" },
  ],
  alpha: [{ id: "alpha-check", title: "Alpha Check", status: "unknown" }],
  beta: [{ id: "beta-check", title: "Beta Check", status: "up" }],
  db: [
    { id: "db-up", title: "Availability", status: "up" },
    { id: "db-down", title: "DB Errors", status: "down" },
  ],
};

const setup = (overrides: Partial<Parameters<typeof useSelectedItemData>[0]> = {}) => ({
  selectedId: "suite",
  selectedNode: suiteNode,
  itemMap,
  itemStatuses,
  itemSignals,
  catalog,
  openedActorId: "",
  ...overrides,
});

afterEach(cleanup);

describe("useSelectedItemData", () => {
  it("uses the backend Item status without inferring health from its signals", () => {
    const { result } = renderHook(() => useSelectedItemData(setup()));
    expect(result.current.selectedStatus).toBe("up");
    expect(result.current.selectedItem?.id).toBe("suite");
    expect(result.current.selectedTitleFirstWord).toBe("Operations");
    expect(result.current.selectedTitleRest).toBe(" Suite");
    expect(result.current.selectedFailingSignals.map((signal) => signal.id)).toEqual([
      "errors",
      "slow",
      "unknown",
    ]);
    expect(result.current.selectedPassingSignals.map((signal) => signal.id)).toEqual([
      "healthy",
    ]);
    expect(result.current.passingSignalsCount).toBe(1);
  });

  it("lists unhealthy dependency signals once per Item, preserving the first tree path", () => {
    const { result } = renderHook(() => useSelectedItemData(setup()));
    expect(result.current.failingDependencies.map((dependency) => dependency.id))
      .toEqual(["alpha", "db"]);
    expect(result.current.failingDependencies[0]).toMatchObject({
      path: ["suite", "alpha"],
      status: "unknown",
      failingCountContribution: 1,
    });
    expect(result.current.failingDependencies[1]).toMatchObject({
      path: ["suite", "alpha", "db"],
      status: "down",
      failingCountContribution: 1,
      failingSignals: [{ id: "db-down", title: "DB Errors", status: "down" }],
    });
  });

  it("prefers an owner actor and the explicitly primary contact", () => {
    const { result } = renderHook(() =>
      useSelectedItemData(setup({ openedActorId: "owner" })),
    );
    expect(result.current.selectedItemActors?.owner?.id).toBe("owner");
    expect(result.current.selectedItemActors?.otherActors.map((actor) => actor.id))
      .toEqual(["viewer"]);
    expect(result.current.actorContactsByActorId.get("owner")?.primaryContact?.id)
      .toBe("phone");
    expect(result.current.openedActor?.id).toBe("owner");
    expect(result.current.openedActorContacts.map((contact) => contact.id))
      .toEqual(["phone", "email"]);
  });

  it("falls back to the primary actor relation when no typed owner exists", () => {
    const relations = {
      ...catalog,
      actors: actors.filter((actor) => actor.id === "viewer"),
      itemActors: itemActors.filter((relation) => relation.actorId === "viewer"),
      actorContacts: [] as CatalogActorContact[],
    };
    const { result } = renderHook(() =>
      useSelectedItemData(setup({ catalog: relations, openedActorId: "missing" })),
    );
    expect(result.current.selectedItemActors?.owner?.id).toBe("viewer");
    expect(result.current.selectedItemActors?.otherActors).toEqual([]);
    expect(result.current.openedActor).toBeNull();
    expect(result.current.openedActorContacts).toEqual([]);
  });

  it("returns empty presentation data when the selected Item is missing", () => {
    const { result } = renderHook(() =>
      useSelectedItemData(setup({ selectedId: "", selectedNode: null })),
    );
    expect(result.current.selectedItem).toBeUndefined();
    expect(result.current.selectedStatus).toBe("unknown");
    expect(result.current.selectedTitleFirstWord).toBe("Select");
    expect(result.current.selectedTitleRest).toBe(" an item");
    expect(result.current.selectedFailingSignals).toEqual([]);
    expect(result.current.failingDependencies).toEqual([]);
    expect(result.current.selectedItemActors).toBeNull();
  });

  it("updates the displayed status and signals when fresh Product Health data arrives", () => {
    const { result, rerender } = renderHook(
      ({ statuses, signals }) =>
        useSelectedItemData(setup({ itemStatuses: statuses, itemSignals: signals })),
      { initialProps: { statuses: itemStatuses, signals: itemSignals } },
    );
    rerender({
      statuses: { suite: "down" },
      signals: { ...itemSignals, suite: [{ id: "ok", status: "up" }] },
    });
    expect(result.current.selectedStatus).toBe("down");
    expect(result.current.selectedFailingSignals).toEqual([]);
    expect(result.current.selectedPassingSignals.map((signal) => signal.id))
      .toEqual(["ok"]);
    expect(result.current.passingSignalsCount).toBe(1);
  });
});
