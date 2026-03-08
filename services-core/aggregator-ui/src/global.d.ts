/// <reference types="vite/client" />
import type {AggregatorUiRuntimeConfig} from './shared/types';

/**
 * Global ambient declarations for browser runtime additions.
 *
 * This file extends standard browser globals so the IDE and TypeScript
 * language service recognize project-specific properties everywhere.
 */
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
