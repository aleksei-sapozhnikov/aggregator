/** @file Converts catalog, health, and assistant HTTP payloads into typed UI contracts. */

import type {
  AgentAskResponse,
  AgentHealthDependencyContent,
  AgentHealthItemContent,
  AgentHealthSignalContent,
  AgentStructuredContent,
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
} from "../shared/types";

interface ProductHealthSignalPayload {
  id?: string;
  title?: string;
  state?: string;
}

interface ProductHealthDependencyPayload {
  itemId?: string;
  title?: string;
  state?: string;
  depth?: number;
}

interface ProductHealthItemPayload {
  itemId?: string;
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
  state?: string;
  ownState?: string;
  signals?: ProductHealthSignalPayload[];
  dependencies?: ProductHealthDependencyPayload[];
  affectingDependencies?: ProductHealthDependencyPayload[];
}

export const resolveBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return new URL(baseUrl, window.location.origin).pathname;
};

export const resolveBaseUrl = (): string =>
  `${window.location.origin}${resolveBasePath()}`;

export const resolveCatalogTitle = (): string =>
  (window.__AGGREGATOR_UI__?.appTitle ?? "").trim();

/** Unrecognized wire values become UNKNOWN; request failures are tracked separately. */
const parseProductHealthStatus = (value: unknown): HealthStatus => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "up" || normalized === "down") {
    return normalized;
  }
  return "unknown";
};

const OPTIONAL_CATALOG_TIMEOUT_MS = 3_000;

export const loadCatalog = async (
  signal?: AbortSignal,
): Promise<{
  items: CatalogItem[];
  dependencies: CatalogDependency[];
  contacts: CatalogContact[];
  itemContacts: CatalogItemContact[];
  actors: CatalogActor[];
  itemActors: CatalogItemActor[];
  actorContacts: CatalogActorContact[];
}> => {
  const [
    itemsData,
    dependenciesData,
    contactsData,
    itemContactsData,
    actorsData,
    itemActorsData,
    actorContactsData,
  ] = await Promise.all([
    loadRequiredJson("catalog/api/catalog/items", signal),
    loadRequiredJson("catalog/api/catalog/dependencies", signal),
    loadOptionalJson("catalog/api/catalog/contacts", signal),
    loadOptionalJson("catalog/api/catalog/item-contacts", signal),
    loadOptionalJson("catalog/api/catalog/actors", signal),
    loadOptionalJson("catalog/api/catalog/item-actors", signal),
    loadOptionalJson("catalog/api/catalog/actor-contacts", signal),
  ]);

  const itemsPayload = itemsData as { items?: unknown };
  const dependenciesPayload = dependenciesData as { dependencies?: unknown };
  const contactsPayload = contactsData as { contacts?: unknown };
  const itemContactsPayload = itemContactsData as { itemContacts?: unknown };
  const actorsPayload = actorsData as { actors?: unknown };
  const itemActorsPayload = itemActorsData as { itemActors?: unknown };
  const actorContactsPayload = actorContactsData as {
    actorContacts?: unknown;
    actorsContacts?: unknown;
  };
  return {
    items: normalizeItems(itemsPayload.items),
    dependencies: normalizeDependencies(dependenciesPayload.dependencies),
    contacts: normalizeContacts(contactsPayload.contacts),
    itemContacts: normalizeItemContacts(itemContactsPayload.itemContacts),
    actors: normalizeActors(actorsPayload.actors),
    itemActors: normalizeItemActors(itemActorsPayload.itemActors),
    actorContacts: normalizeActorContacts(
      actorContactsPayload.actorContacts || actorContactsPayload.actorsContacts,
    ),
  };
};

const normalizeItems = (rawItems: unknown): CatalogItem[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .filter(
      (
        entry,
      ): entry is {
        id?: string;
        title?: string;
        shortDescription?: string;
        fullDescription?: string;
      } => Boolean(entry),
    )
    .map((item) => ({
      id: String(item.id || "").trim(),
      title: String(item.title || item.id || "").trim(),
      shortDescription: normalizeOptionalText(item.shortDescription),
      fullDescription: normalizeOptionalText(item.fullDescription),
    }))
    .filter((item) => Boolean(item.id));
};

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
};

const normalizeDependencies = (
  rawDependencies: unknown,
): CatalogDependency[] => {
  if (!Array.isArray(rawDependencies)) {
    return [];
  }
  return rawDependencies
    .filter((entry): entry is { sourceId?: string; targetId?: string } =>
      Boolean(entry),
    )
    .map((dependency) => ({
      sourceId: String(dependency.sourceId || "").trim(),
      targetId: String(dependency.targetId || "").trim(),
    }))
    .filter(
      (dependency) =>
        Boolean(dependency.sourceId) && Boolean(dependency.targetId),
    );
};

const normalizeContacts = (rawContacts: unknown): CatalogContact[] => {
  if (!Array.isArray(rawContacts)) {
    return [];
  }
  return rawContacts
    .filter(
      (
        entry,
      ): entry is {
        id?: string;
        title?: string;
        type?: string;
        href?: string;
      } => Boolean(entry),
    )
    .map((contact) => ({
      id: String(contact.id || "").trim(),
      title: String(contact.title || contact.id || "").trim(),
      type: String(contact.type || "").trim(),
      href: String(contact.href || "").trim(),
    }))
    .filter((contact) => Boolean(contact.id) && Boolean(contact.type));
};

const normalizeItemContacts = (
  rawItemContacts: unknown,
): CatalogItemContact[] => {
  if (!Array.isArray(rawItemContacts)) {
    return [];
  }
  return rawItemContacts
    .filter((entry): entry is { itemId?: string; contactId?: string } =>
      Boolean(entry),
    )
    .map((itemContact) => ({
      itemId: String(itemContact.itemId || "").trim(),
      contactId: String(itemContact.contactId || "").trim(),
    }))
    .filter(
      (itemContact) =>
        Boolean(itemContact.itemId) && Boolean(itemContact.contactId),
    );
};

const normalizeActors = (rawActors: unknown): CatalogActor[] => {
  if (!Array.isArray(rawActors)) {
    return [];
  }
  return rawActors
    .filter(
      (
        entry,
      ): entry is {
        id?: string;
        title?: string;
        type?: string;
        description?: string;
      } => Boolean(entry),
    )
    .map((actor) => ({
      id: String(actor.id || "").trim(),
      title: String(actor.title || "").trim(),
      type: String(actor.type || "").trim(),
      description: String(actor.description || "").trim(),
    }))
    .filter(
      (actor) =>
        Boolean(actor.id) &&
        Boolean(actor.title) &&
        isSupportedActorType(actor.type),
    )
    .map((actor) => ({
      ...actor,
      type: actor.type as CatalogActor["type"],
    }));
};

const normalizeItemActors = (rawItemActors: unknown): CatalogItemActor[] => {
  if (!Array.isArray(rawItemActors)) {
    return [];
  }
  return rawItemActors
    .filter(
      (
        entry,
      ): entry is {
        itemId?: string;
        actorId?: string;
        isPrimary?: boolean | string | number;
        primary?: boolean | string | number;
        isOwner?: boolean | string | number;
      } => Boolean(entry),
    )
    .map((itemActor) => {
      const isPrimary =
        toBoolean(itemActor.isPrimary) ||
        toBoolean(itemActor.primary) ||
        toBoolean(itemActor.isOwner) ||
        false;
      return {
        itemId: String(itemActor.itemId || "").trim(),
        actorId: String(itemActor.actorId || "").trim(),
        isPrimary,
      };
    })
    .filter(
      (itemActor) => Boolean(itemActor.itemId) && Boolean(itemActor.actorId),
    );
};

const normalizeActorContacts = (
  rawActorContacts: unknown,
): CatalogActorContact[] => {
  if (!Array.isArray(rawActorContacts)) {
    return [];
  }
  return rawActorContacts
    .filter(
      (
        entry,
      ): entry is {
        actorId?: string;
        contactId?: string;
        isPrimary?: boolean | string | number;
        primary?: boolean | string | number;
      } => Boolean(entry),
    )
    .map((actorContact) => ({
      actorId: String(actorContact.actorId || "").trim(),
      contactId: String(actorContact.contactId || "").trim(),
      isPrimary:
        toBoolean(actorContact.isPrimary) || toBoolean(actorContact.primary),
    }))
    .filter(
      (actorContact) =>
        Boolean(actorContact.actorId) && Boolean(actorContact.contactId),
    );
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "y"
    );
  }
  return false;
};

const isSupportedActorType = (value: string): value is CatalogActor["type"] =>
  value === "owner" || value === "user" || value === "other";

const loadRequiredJson = async (
  path: string,
  signal?: AbortSignal,
): Promise<unknown> => {
  const response = await fetch(new URL(path, resolveBaseUrl()), { signal });
  if (!response.ok) {
    throw new Error(`Failed to load catalog data: ${response.status}`);
  }
  return (await response.json()) as unknown;
};

/** Optional metadata must not hold catalog initialization open indefinitely. */
const loadOptionalJson = async (
  path: string,
  signal?: AbortSignal,
): Promise<unknown> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    controller.abort();
  }
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    OPTIONAL_CATALOG_TIMEOUT_MS,
  );
  try {
    const response = await fetch(new URL(path, resolveBaseUrl()), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {};
    }
    const payload = (await response.json()) as unknown;
    if (
      payload !== null &&
      typeof payload === "object" &&
      !Array.isArray(payload)
    ) {
      return payload;
    }
    return {};
  } catch (error) {
    if (!signal?.aborted) {
      console.warn(`Optional catalog data unavailable: ${path}`, error);
    }
    return {};
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abort);
  }
};

export const fetchProductHealth = async (
  signal?: AbortSignal,
): Promise<{
  items: ProductHealthItem[];
  itemStatuses: Record<string, HealthStatus>;
  itemSignals: Record<string, ItemSignal[]>;
}> => {
  const response = await fetch(
    new URL("api/product-health/items", resolveBaseUrl()),
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Failed to load product health: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Invalid Product Health response");
  }
  const items = payload
    .map(normalizeProductHealthItem)
    .filter((item): item is ProductHealthItem => Boolean(item));
  const itemStatuses: Record<string, HealthStatus> = {};
  const itemSignals: Record<string, ItemSignal[]> = {};
  items.forEach((item) => {
    itemStatuses[item.itemId] = item.state;
    itemSignals[item.itemId] = item.signals;
  });
  return { items, itemStatuses, itemSignals };
};

const normalizeProductHealthItem = (
  rawItem: unknown,
): ProductHealthItem | null => {
  const item = rawItem as ProductHealthItemPayload;
  const itemId = String(item?.itemId || "").trim();
  if (!itemId) {
    return null;
  }
  return {
    itemId,
    title: String(item.title || itemId).trim(),
    shortDescription: normalizeOptionalText(item.shortDescription),
    fullDescription: normalizeOptionalText(item.fullDescription),
    state: parseProductHealthStatus(item.state),
    ownState: parseProductHealthStatus(item.ownState),
    signals: normalizeProductHealthSignals(item.signals),
    dependencies: normalizeProductHealthDependencies(item.dependencies),
    affectingDependencies: normalizeProductHealthDependencies(
      item.affectingDependencies,
    ),
  };
};

const normalizeProductHealthSignals = (rawSignals: unknown): ItemSignal[] => {
  if (!Array.isArray(rawSignals)) {
    return [];
  }
  return rawSignals
    .filter((entry): entry is ProductHealthSignalPayload => Boolean(entry))
    .map((signal) => ({
      id: String(signal.id || "").trim(),
      title: String(signal.title || signal.id || "").trim(),
      status: parseProductHealthStatus(signal.state),
    }))
    .filter((signal) => Boolean(signal.id));
};

const normalizeProductHealthDependencies = (
  rawDependencies: unknown,
): ProductHealthItem["dependencies"] => {
  if (!Array.isArray(rawDependencies)) {
    return [];
  }
  return rawDependencies
    .filter((entry): entry is ProductHealthDependencyPayload => Boolean(entry))
    .map((dependency) => ({
      itemId: String(dependency.itemId || "").trim(),
      title: String(dependency.title || dependency.itemId || "").trim(),
      state: parseProductHealthStatus(dependency.state),
      depth: Number.isFinite(dependency.depth) ? Number(dependency.depth) : 0,
    }))
    .filter((dependency) => Boolean(dependency.itemId));
};

export const askAgent = async (question: string): Promise<AgentAskResponse> => {
  const response = await fetch("/api/agent/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    let details = "";
    try {
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
      };
      details = payload.message || payload.error || "";
    } catch {
      // Ignore non-JSON error payloads and fall back to status.
    }
    throw new Error(details || `Failed to ask AI chat: ${response.status}`);
  }
  const payload = (await response.json()) as Partial<AgentAskResponse>;
  return {
    answer: sanitizeAgentAnswer(payload.answer),
    structured_content: normalizeAgentStructuredContent(
      payload.structured_content,
    ),
    tool_calls: payload.tool_calls,
    usage: payload.usage,
  };
};

/** Strip model reasoning tags and their contents from the displayed answer. */
const sanitizeAgentAnswer = (value: unknown): string => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text
    .replace(
      /<\s*(thinking|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\/?\s*(thinking|analysis|reasoning)\b[^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeAgentStructuredContent = (
  rawContent: unknown,
): AgentStructuredContent | null => {
  const content = rawContent as {
    type?: unknown;
    scope?: unknown;
    items?: unknown;
  };
  if (content?.type !== "product_health") {
    return null;
  }
  return {
    type: "product_health",
    scope:
      content.scope === "item" || content.scope === "unhealthy_items"
        ? content.scope
        : "unhealthy_items",
    items: normalizeAgentHealthItems(content.items),
  };
};

const normalizeAgentHealthItems = (
  rawItems: unknown,
): AgentHealthItemContent[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .map(normalizeAgentHealthItem)
    .filter((item): item is AgentHealthItemContent => Boolean(item));
};

const normalizeAgentHealthItem = (
  rawItem: unknown,
): AgentHealthItemContent | null => {
  const item = rawItem as {
    item_id?: unknown;
    title?: unknown;
    state?: unknown;
    signals?: unknown;
    affecting_dependencies?: unknown;
  };
  const itemId = String(item?.item_id || "").trim();
  if (!itemId) {
    return null;
  }
  return {
    item_id: itemId,
    title: String(item.title || itemId).trim(),
    state: parseProductHealthStatus(item.state),
    signals: normalizeAgentHealthSignals(item.signals),
    affecting_dependencies: normalizeAgentHealthDependencies(
      item.affecting_dependencies,
    ),
  };
};

const normalizeAgentHealthSignals = (
  rawSignals: unknown,
): AgentHealthSignalContent[] => {
  if (!Array.isArray(rawSignals)) {
    return [];
  }
  return rawSignals
    .filter(
      (entry): entry is { id?: unknown; title?: unknown; state?: unknown } =>
        Boolean(entry),
    )
    .map((signal) => {
      const id = String(signal.id || "").trim();
      return {
        id,
        title: String(signal.title || id).trim(),
        state: parseProductHealthStatus(signal.state),
      };
    })
    .filter((signal) => Boolean(signal.id));
};

const normalizeAgentHealthDependencies = (
  rawDependencies: unknown,
): AgentHealthDependencyContent[] => {
  if (!Array.isArray(rawDependencies)) {
    return [];
  }
  return rawDependencies
    .filter(
      (
        entry,
      ): entry is {
        item_id?: unknown;
        title?: unknown;
        state?: unknown;
        signals?: unknown;
      } => Boolean(entry),
    )
    .map((dependency) => {
      const itemId = String(dependency.item_id || "").trim();
      return {
        item_id: itemId,
        title: String(dependency.title || itemId).trim(),
        state: parseProductHealthStatus(dependency.state),
        signals: normalizeAgentHealthSignals(dependency.signals),
      };
    })
    .filter((dependency) => Boolean(dependency.item_id));
};
