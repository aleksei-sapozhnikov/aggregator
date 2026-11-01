# HTTP adapters

`aggregatorApi.ts` is the HTTP boundary for catalog metadata, Product Health,
and optional AI-agent requests. It normalizes payloads into the contracts in
`src/shared/types.ts`; callers consume typed results rather than decoding
responses themselves. The signal details dialog fetches its catalog definition
when opened.

Items and dependencies are required for catalog initialization. Actor and
contact metadata are best-effort: each optional request has a 3-second timeout
and may fail without discarding the required records. All requests honor
cancellation of the catalog load.

The adapter normalizes reported health values without recalculating Product
Health. A Product Health response must be an array; other payload shapes and
failed requests reject so that `useCatalogData` can track connectivity and
preserve the previous snapshot.
