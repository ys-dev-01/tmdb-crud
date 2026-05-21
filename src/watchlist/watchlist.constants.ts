/** Default page size for GET /watchlist. Mirrors MOVIES_LIST_DEFAULT_LIMIT. */
export const WATCHLIST_LIST_DEFAULT_LIMIT = 20;

/**
 * Hard cap on ?limit. Watchlists are typically small (tens of movies per
 * user) so this is mostly defensive — keeps a single response under a
 * few hundred KB even if a power-user has saved a lot.
 */
export const WATCHLIST_LIST_MAX_LIMIT = 50;

/** Cache TTL for GET /watchlist responses (5 minutes). */
export const WATCHLIST_CACHE_TTL_MS = 5 * 60 * 1000;

/** Max jitter added to each cache.set TTL — prevents stampede on cold start. */
export const WATCHLIST_CACHE_TTL_JITTER_MS = 30 * 1000;

/**
 * Redis key prefix for the per-user "namespace version". Each user has
 * their own counter (e.g., watchlist:version:42). Bumped on every write
 * by that user, so their previously-cached list pages become unreachable
 * in O(1). Per-user scoping means user A's writes don't invalidate user
 * B's cache.
 */
export const WATCHLIST_VERSION_KEY_PREFIX = 'watchlist:version:';

/** TTL for the per-user version key — 30 days, refreshed on each write. */
export const WATCHLIST_VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default version value before the first write by a given user. */
export const WATCHLIST_VERSION_DEFAULT = '0';
