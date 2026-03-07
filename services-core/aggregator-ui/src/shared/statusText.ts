/**
 * @file Helpers for consistent status text formatting in UI/ARIA labels.
 */
import type {HealthStatus} from './types';

type StatusTextOptions = {
    lastUpdated?: string;
};

/**
 * Builds a human-readable status label with optional update timestamp.
 */
export const buildStatusText = (
    status: HealthStatus | string | undefined,
    {lastUpdated}: StatusTextOptions = {},
) =>
    `Status: ${(status || 'unknown').toUpperCase()}${
        lastUpdated ? ` (at ${lastUpdated})` : ''
    }`;
