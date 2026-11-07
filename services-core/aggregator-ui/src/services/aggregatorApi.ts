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

/** Returns the deployment-relative path prefix for static UI resources. */
export const resolveBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return new URL(baseUrl, window.location.origin).pathname;
};

/** Resolves the backend API base URL. */
export const resolveBaseUrl = (): string =>
  `${window.location.origin}${resolveBasePath()}`;

/** Returns the configured name of the catalog. */
export const resolveCatalogTitle = (): string =>
  (import.meta.env.VITE_APP_TITLE ?? "").trim();

/** Normalizes a server-provided health state into the supported UI union. */
const parseProductHealthStatus = (value: unknown): HealthStatus => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "up" || normalized === "down") {
    return normalized;
  }
  return "unknown";
};

/** Fetches required catalog data and optional ownership and contact relationships. */
export const loadCatalog = async (): Promise<{
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
    loadRequiredJson("catalog/api/catalog/items"),
    loadRequiredJson("catalog/api/catalog/dependencies"),
    loadOptionalJson("catalog/api/catalog/contacts"),
    loadOptionalJson("catalog/api/catalog/item-contacts"),
    loadOptionalJson("catalog/api/catalog/actors"),
    loadOptionalJson("catalog/api/catalog/item-actors"),
    loadOptionalJson("catalog/api/catalog/actor-contacts"),
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

/** Converts raw catalog entries into typed Item records. */
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

/** Trims optional description fields and omits empty values. */
const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
};

/** Validates and normalizes dependency edges from the catalog. */
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

/** Converts raw contact records into typed contact entries. */
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

/** Validates direct Item-to-contact relationships. */
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

/** Converts raw people and team records into typed actors. */
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

/** Normalizes Item-to-actor relationships and ownership flags. */
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

/** Normalizes relationships between actors and their available contacts. */
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

/** Interprets supported boolean-like values from catalog fields. */
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

/** Checks whether a catalog actor role is supported by the UI. */
const isSupportedActorType = (value: string): value is CatalogActor["type"] =>
  value === "owner" || value === "user" || value === "other";

/** Fetches a required catalog endpoint and fails on non-successful responses. */
const loadRequiredJson = async (path: string): Promise<unknown> => {
  const response = await fetch(new URL(path, resolveBaseUrl()));
  if (!response.ok) {
    throw new Error(`Failed to load catalog data: ${response.status}`);
  }
  return (await response.json()) as unknown;
};

/** Fetches optional catalog data without blocking the required catalog. */
const loadOptionalJson = async (path: string): Promise<unknown> => {
  const response = await fetch(new URL(path, resolveBaseUrl()));
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as unknown;
};

/** Retrieves current server-computed Item statuses and signal/dependency facts. */
export const fetchProductHealth = async (): Promise<{
  items: ProductHealthItem[];
  itemStatuses: Record<string, HealthStatus>;
  itemSignals: Record<string, ItemSignal[]>;
}> => {
  const response = await fetch(
    new URL("api/product-health/items", resolveBaseUrl()),
  );
  if (!response.ok) {
    throw new Error(`Failed to load product health: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  const rawItems = Array.isArray(payload) ? payload : [];
  const items = rawItems
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

/** Maps one Product Health response Item to the UI data contract. */
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

/** Maps health signals while preserving their reported states. */
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

/** Maps dependency health information returned for an Item. */
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

/** Submits a question to the optional AI agent and interprets its response. */
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

/** Removes unsupported model formatting before showing assistant text. */
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

/** Normalizes structured agent results for deterministic UI rendering. */
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

/** Converts the collection of Item health facts in an agent result. */
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

/** Converts one agent-provided health Item to its UI representation. */
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

/** Maps agent-provided signals to typed facts without recalculating their health. */
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

/** Maps reported affected dependencies and their signals into typed facts. */
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
