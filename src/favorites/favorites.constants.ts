/** Default page size for GET /favorites. */
export const FAVORITES_LIST_DEFAULT_LIMIT = 20;

/** Hard cap on ?limit — defensive, favorites lists are typically small. */
export const FAVORITES_LIST_MAX_LIMIT = 50;

/** Cache TTL for GET /favorites responses (5 minutes). */
export const FAVORITES_CACHE_TTL_MS = 5 * 60 * 1000;

/** Max jitter added to each cache.set TTL — prevents stampede on cold start. */
export const FAVORITES_CACHE_TTL_JITTER_MS = 30 * 1000;

/**
 * Redis key prefix for the per-user version counter. Bumped on every
 * write by that user; their list cache becomes unreachable in O(1)
 * without touching anyone else's cache.
 */
export const FAVORITES_VERSION_KEY_PREFIX = 'favorites:version:';

/** TTL for the per-user version key — 30 days, refreshed on each write. */
export const FAVORITES_VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default version value before the first write by a given user. */
export const FAVORITES_VERSION_DEFAULT = '0';
