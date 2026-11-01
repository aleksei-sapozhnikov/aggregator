/** @file Declares global ambient types for UI runtime configuration. */

/// <reference types="vite/client" />
import type { AggregatorUiRuntimeConfig } from "./shared/types";

declare global {
  // noinspection JSUnusedGlobalSymbols
  interface Window {
    /**
     * Optional runtime config injected by the host page before app startup.
     */
    __AGGREGATOR_UI__?: AggregatorUiRuntimeConfig;
  }
}

export {};
