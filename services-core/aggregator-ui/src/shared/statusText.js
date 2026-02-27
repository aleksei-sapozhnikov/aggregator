/**
 * @file Helpers for consistent status text formatting in UI/ARIA labels.
 */

/**
 * Builds a human-readable status label with optional update timestamp.
 */
export const buildStatusText = (status, {lastUpdated} = {}) =>
    `Status: ${(status || 'unknown').toUpperCase()}${
        lastUpdated ? ` (at ${lastUpdated})` : ''
    }`;
