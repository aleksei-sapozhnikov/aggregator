import type {
  AggregatorUiRuntimeConfig,
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
  state?: string;
  ownState?: string;
  signals?: ProductHealthSignalPayload[];
  dependencies?: ProductHealthDependencyPayload[];
  affectingDependencies?: ProductHealthDependencyPayload[];
}

export const DASHBOARDS = {
  timeline: {
    uid: "item-health-state",
    slug: "item-health-state",
    panelId: 3001,
  },
} as const;

export const GRAFANA_FRAME_WRAPPER_REV = "v2026-03-04";

const resolveTimelineDefaultRange = (): string => {
  const configured = (import.meta.env.VITE_TIMELINE_DEFAULT_RANGE ?? "").trim();
  if (!configured) {
    throw new Error("VITE_TIMELINE_DEFAULT_RANGE is required");
  }
  return configured.startsWith("now-") ? configured.slice(4) : configured;
};

const TIMELINE_DEFAULT_RANGE = resolveTimelineDefaultRange();

export const getInitialTheme = (): "dark" | "light" => {
  const stored = localStorage.getItem("aggregator-ui-theme");
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const resolveBasePath = (): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return new URL(baseUrl, window.location.origin).pathname;
};

export const resolveBaseUrl = (): string =>
  `${window.location.origin}${resolveBasePath()}`;

export const resolveGrafanaBaseUrl = (): string => {
  const runtimeConfig = window.__AGGREGATOR_UI__ as
    | AggregatorUiRuntimeConfig
    | undefined;
  const configured = runtimeConfig?.grafanaUrl;
  if (configured) {
    return configured;
  }
  if (import.meta.env.VITE_GRAFANA_URL) {
    return import.meta.env.VITE_GRAFANA_URL;
  }
  return `${resolveBaseUrl()}grafana`;
};

export const resolveSidebarTitle = (): string =>
  (import.meta.env.VITE_APP_TITLE ?? "").trim();

const parseProductHealthStatus = (value: unknown): HealthStatus => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "up" || normalized === "down") {
    return normalized;
  }
  return "unknown";
};

export const compareHealthStatus = (
  left: HealthStatus,
  right: HealthStatus,
): number => {
  const order: Record<HealthStatus, number> = { down: 0, unknown: 1, up: 2 };
  return order[left] - order[right];
};

const normalizeDashboardBaseUrl = (
  baseUrl: string,
  dashboardUid: string,
  dashboardSlug = dashboardUid,
): string => {
  const url = new URL(baseUrl, window.location.origin);
  const segments = url.pathname.split("/").filter(Boolean);
  const dashboardIndex = segments.findIndex(
    (segment) => segment === "d" || segment === "d-solo",
  );

  if (dashboardIndex !== -1 && segments[dashboardIndex + 1] === dashboardUid) {
    segments[dashboardIndex] = "d";
    if (segments[dashboardIndex + 2]) {
      segments.length = dashboardIndex + 3;
    } else {
      segments.length = dashboardIndex + 2;
      segments.push(dashboardSlug);
    }
  } else {
    segments.push("d", dashboardUid, dashboardSlug);
  }

  url.pathname = `/${segments.join("/")}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
};

export const buildDashboardUrl = (
  baseUrl: string,
  dashboardUid: string,
  dashboardSlug: string,
  itemId: string,
  theme: "dark" | "light",
  panelId: string | number | null | undefined,
  appBaseUrl = "",
): string => {
  const params = new URLSearchParams({
    orgId: "1",
    "var-item_id": itemId,
    "var-app_base_url": appBaseUrl,
    theme,
    from: `now-${TIMELINE_DEFAULT_RANGE}`,
    to: "now",
  });
  if (panelId !== null && panelId !== undefined && panelId !== "") {
    params.set("viewPanel", String(panelId));
  }
  const normalizedBaseUrl = normalizeDashboardBaseUrl(
    baseUrl,
    dashboardUid,
    dashboardSlug,
  );
  return `${normalizedBaseUrl}?${params.toString()}&kiosk`;
};

export const buildGrafanaFrameUrl = ({
  initialTheme,
  grafanaUrl = "",
}: { initialTheme?: string; grafanaUrl?: string } = {}): string => {
  const frameUrl = new URL("grafana-frame/index.html", resolveBaseUrl());
  frameUrl.searchParams.set("rev", GRAFANA_FRAME_WRAPPER_REV);
  frameUrl.searchParams.set(
    "theme",
    initialTheme === "dark" ? "dark" : "light",
  );
  if (grafanaUrl) {
    frameUrl.searchParams.set("src", encodeURIComponent(grafanaUrl));
  }
  return frameUrl.toString();
};

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

const normalizeItems = (rawItems: unknown): CatalogItem[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  return rawItems
    .filter((entry): entry is { id?: string; title?: string } => Boolean(entry))
    .map((item) => ({
      id: String(item.id || "").trim(),
      title: String(item.title || item.id || "").trim(),
    }))
    .filter((item) => Boolean(item.id));
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

const loadRequiredJson = async (path: string): Promise<unknown> => {
  const response = await fetch(new URL(path, resolveBaseUrl()));
  if (!response.ok) {
    throw new Error(`Failed to load catalog data: ${response.status}`);
  }
  return (await response.json()) as unknown;
};

const loadOptionalJson = async (path: string): Promise<unknown> => {
  const response = await fetch(new URL(path, resolveBaseUrl()));
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as unknown;
};

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

export const submitFeedback = async (
  text: string,
): Promise<{ id: string; receivedAt: string }> => {
  const response = await fetch("/api/feedback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
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
    throw new Error(details || `Failed to submit feedback: ${response.status}`);
  }
  return (await response.json()) as { id: string; receivedAt: string };
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
