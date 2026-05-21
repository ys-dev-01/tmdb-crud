/**
 * Default for MOVIES_SYNC_MAX_PAGES. Five pages = ~100 movies; enough to
 * demo pagination + filtering with a fast first boot. Override via env in
 * prod to backfill more of TMDB's catalog.
 */
export const MOVIES_SYNC_DEFAULT_MAX_PAGES = 5;

/** Default page size for GET /movies when the caller omits ?limit. */
export const MOVIES_LIST_DEFAULT_LIMIT = 20;

/**
 * Hard cap on ?limit so a caller can't request 10k rows in one shot.
 * 50 keeps the response under a few hundred kilobytes even with full
 * overview text.
 */
export const MOVIES_LIST_MAX_LIMIT = 50;

/**
 * Minimum length of /movies/search ?q=. Below 2 characters, ILIKE
 * '%x%' degenerates to a full-table scan and can't take useful advantage
 * of the trigram index (trigrams are 3-character grams).
 */
export const MOVIES_SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Upper bound on ?q= so a caller can't smuggle a pathological pattern.
 * 100 characters is longer than any real movie title.
 */
export const MOVIES_SEARCH_MAX_QUERY_LENGTH = 100;

/**
 * Cache TTL for the three /movies read endpoints. 5 minutes balances
 * freshness against load: TMDB sync runs daily, ratings update is
 * cache-busted on write (PR #8), and 5min keeps repeat reads fast
 * without making stale data feel sticky.
 */
export const MOVIES_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Max additional jitter added to each cache entry's TTL. Prevents the
 * "cache stampede" pattern where many keys expire simultaneously after
 * a cold start and all hit the DB at once. ±30s on a 5min baseline is
 * a small spread that's invisible to users.
 */
export const MOVIES_CACHE_TTL_JITTER_MS = 30 * 1000;

/**
 * Cache key holding the current "version" of the movies list/search
 * cache namespace. Bumped (set to Date.now()) by ratings writes so the
 * next read constructs a fresh cache key prefix and bypasses all
 * previously-cached list/search entries. Equivalent to Rails' Russian
 * doll caching — O(1) invalidation of a whole namespace without SCAN.
 *
 * Per-movie detail caches (`movies:detail:{id}`) are deleted directly
 * since their keys are enumerable from the movie id.
 */
export const MOVIES_RATING_VERSION_KEY = 'movies:rating-version';

/**
 * TTL for the version key. Long enough that an idle deployment doesn't
 * lose its version (which would invalidate the list/search namespace
 * silently on the next read), short enough to not pile up forever in
 * Redis if the key is ever orphaned. 30 days is well past any normal
 * idle window.
 */
export const MOVIES_RATING_VERSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Default version string used before any rating write has bumped it. */
export const MOVIES_RATING_VERSION_DEFAULT = '0';
