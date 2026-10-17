/**
 * @file Loads catalog metadata and polls backend Product Health, tracking connectivity separately.
 * Retains the last successful health snapshot during request failures.
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
  HealthConnectionStatus,
  HealthStatus,
  ItemSignal,
  ProductHealthItem,
} from "../../shared/types";

const HEALTH_POLL_INTERVAL_MS = 10_000;
const HEALTH_REQUEST_TIMEOUT_MS = 8_000;
const CATALOG_RETRY_INTERVAL_MS = 10_000;
const CATALOG_REQUEST_TIMEOUT_MS = 8_000;

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
  const [lastSuccessfulFetchAt, setLastSuccessfulFetchAt] = useState<
    number | null
  >(null);
  const [disconnectedDetectedAt, setDisconnectedDetectedAt] = useState<
    number | null
  >(null);
  const [connectionStatus, setConnectionStatus] =
    useState<HealthConnectionStatus>("connecting");

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const loadInitialCatalog = async () => {
      if (cancelled || loaded || inFlight) {
        return;
      }
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        CATALOG_REQUEST_TIMEOUT_MS,
      );
      try {
        const nextCatalog = await loadCatalog(controller.signal);
        if (!cancelled) {
          loaded = true;
          setCatalog(nextCatalog);
          setError("");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load catalog",
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        inFlight = false;
        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    void loadInitialCatalog();
    const retryInterval = window.setInterval(() => {
      void loadInitialCatalog();
    }, CATALOG_RETRY_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(retryInterval);
      activeController?.abort();
    };
  }, []);

  useEffect(() => {
    if (!catalog.items.length) {
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    /** Skips interval ticks while a request is still in flight. */
    const fetchStatuses = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        HEALTH_REQUEST_TIMEOUT_MS,
      );
      try {
        const next = await fetchProductHealth(controller.signal);
        if (!cancelled) {
          setItemStatuses(next.itemStatuses);
          setItemSignals(next.itemSignals);
          setProductHealthByItemId(
            Object.fromEntries(next.items.map((item) => [item.itemId, item])),
          );
          setLastSuccessfulFetchAt(Date.now());
          setDisconnectedDetectedAt(null);
          setConnectionStatus("connected");
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          // A transport failure does not change the last reported health facts.
          setDisconnectedDetectedAt((previous) => previous ?? Date.now());
          setConnectionStatus("disconnected");
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (activeController === controller) {
          activeController = null;
        }
        inFlight = false;
      }
    };

    void fetchStatuses();
    const interval = window.setInterval(() => {
      void fetchStatuses();
    }, HEALTH_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      activeController?.abort();
    };
  }, [catalog.items]);

  return {
    catalog,
    error,
    itemStatuses,
    itemSignals,
    productHealthByItemId,
    lastUpdated:
      lastSuccessfulFetchAt === null
        ? ""
        : new Date(lastSuccessfulFetchAt).toLocaleTimeString(),
    connectionStatus,
    lastSuccessfulFetchAt,
    disconnectedDetectedAt,
  };
}
