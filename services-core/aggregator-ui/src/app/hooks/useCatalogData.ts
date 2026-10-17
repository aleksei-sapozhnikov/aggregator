/**
 * Owns initial catalog loading and periodic Product Health polling.
 * Health states are backend facts; this hook never computes or infers them.
 */
import { useEffect, useState } from "react";
import { fetchProductHealth, loadCatalog } from "../../services/aggregatorApi";
import type {
  CatalogActor,
  CatalogActorContact,
  CatalogContact,
  CatalogDependency,
  CatalogItem,
  CatalogItemActor,
  CatalogItemContact,
  HealthStatus,
  ItemSignal,
  ProductHealthItem,
} from "../../shared/types";

const HEALTH_POLL_INTERVAL_MS = 10_000;

const EMPTY_CATALOG: {
  items: CatalogItem[];
  dependencies: CatalogDependency[];
  contacts: CatalogContact[];
  itemContacts: CatalogItemContact[];
  actors: CatalogActor[];
  itemActors: CatalogItemActor[];
  actorContacts: CatalogActorContact[];
} = {
  items: [],
  dependencies: [],
  contacts: [],
  itemContacts: [],
  actors: [],
  itemActors: [],
  actorContacts: [],
};

export default function useCatalogData() {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [error, setError] = useState("");
  const [itemStatuses, setItemStatuses] = useState<
    Record<string, HealthStatus>
  >({});
  const [itemSignals, setItemSignals] = useState<Record<string, ItemSignal[]>>(
    {},
  );
  const [productHealthByItemId, setProductHealthByItemId] = useState<
    Record<string, ProductHealthItem>
  >({});
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadInitialCatalog = async () => {
      try {
        const nextCatalog = await loadCatalog();
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load catalog",
          );
        }
      }
    };

    void loadInitialCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalog.items.length) {
      return undefined;
    }

    let cancelled = false;

    const fetchStatuses = async () => {
      try {
        const next = await fetchProductHealth();
        if (!cancelled) {
          setItemStatuses(next.itemStatuses);
          setItemSignals(next.itemSignals);
          setProductHealthByItemId(
            Object.fromEntries(next.items.map((item) => [item.itemId, item])),
          );
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
        }
      }
    };

    void fetchStatuses();
    const interval = window.setInterval(() => {
      void fetchStatuses();
    }, HEALTH_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [catalog.items]);

  return {
    catalog,
    error,
    itemStatuses,
    itemSignals,
    productHealthByItemId,
    lastUpdated,
  };
}
