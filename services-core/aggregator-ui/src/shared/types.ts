/**
 * @file Shared TypeScript type definitions for aggregator-ui.
 */

export type HealthStatus = "up" | "down" | "unknown";

export interface CatalogItem {
  id: string;
  title?: string;
}

export interface CatalogDependency {
  sourceId: string;
  targetId: string;
}

export interface CatalogContact {
  id: string;
  title?: string;
  type: string;
  href?: string;
}

export interface CatalogItemContact {
  itemId: string;
  contactId: string;
}

export type CatalogActorType = "owner" | "user" | "other";

export interface CatalogActor {
  id: string;
  title: string;
  type: CatalogActorType;
  description?: string;
}

export interface CatalogItemActor {
  itemId: string;
  actorId: string;
  isPrimary?: boolean;
}

export interface CatalogActorContact {
  actorId: string;
  contactId: string;
  isPrimary?: boolean;
}

export interface CatalogTreeNode {
  item: CatalogItem;
  children: CatalogTreeNode[];
  uid: string;
  path: string[];
}

export interface ItemSignal {
  id: string;
  title?: string;
  status: HealthStatus;
}

export interface SearchResult {
  item: CatalogItem;
  score: number;
}

export interface SearchAutocompleteOption {
  word: string;
  fullQuery: string;
}

export interface SearchAutocompleteIndex {
  tokenToItemIds: Map<string, Set<number>>;
  itemIdToTokens: string[][];
}

export interface FailingDependencyEntry {
  id: string;
  name: string;
  path: string[];
  status: HealthStatus;
  failingSignals: ItemSignal[];
  failingCountContribution: number;
}

export interface AggregatorUiRuntimeConfig {
  grafanaUrl?: string;
  prometheusUrl?: string;
}
