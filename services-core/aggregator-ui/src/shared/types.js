/**
 * @file Shared JSDoc type definitions for aggregator-ui.
 */

/**
 * @typedef {'up' | 'down' | 'unknown'} HealthStatus
 */

/**
 * @typedef {Object} CatalogItem
 * @property {string} id
 * @property {string} [name]
 * @property {string} [type]
 */

/**
 * @typedef {Object} CatalogDependency
 * @property {string} sourceId
 * @property {string} targetId
 */

/**
 * @typedef {Object} CatalogTreeNode
 * @property {CatalogItem} item
 * @property {CatalogTreeNode[]} children
 * @property {string} uid
 * @property {string[]} path
 */

/**
 * @typedef {Object} ItemSignal
 * @property {string} id
 * @property {string} [name]
 * @property {HealthStatus} status
 */

/**
 * @typedef {Object} SearchResult
 * @property {CatalogItem} item
 * @property {number} score
 */

/**
 * @typedef {Object} SearchAutocompleteOption
 * @property {string} word
 * @property {string} fullQuery
 */

/**
 * @typedef {Object} SearchAutocompleteIndex
 * @property {Map<string, Set<number>>} tokenToItemIds
 * @property {string[][]} itemIdToTokens
 */

/**
 * @typedef {Object} FailingDependencyEntry
 * @property {string} id
 * @property {string} name
 * @property {string[]} path
 * @property {HealthStatus} status
 * @property {ItemSignal[]} failingSignals
 * @property {number} failingCountContribution
 */

/**
 * @typedef {Object} AggregatorUiRuntimeConfig
 * @property {string} [grafanaUrl]
 * @property {string} [prometheusUrl]
 */

export {};
