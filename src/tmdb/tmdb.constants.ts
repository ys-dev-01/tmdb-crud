/**
 * Limits and constants for the TMDB v3 API. Centralized so the Joi schema,
 * the client retry config, and the sync service all reference the same
 * named values instead of inlining 500 / 10_000 / 429 in three places.
 *
 * Documented in TMDB's API reference:
 * https://developer.themoviedb.org/reference/discover-movie
 */

/** Lowest valid page number TMDB accepts for /discover/movie. */
export const TMDB_DISCOVER_PAGE_MIN = 1;

/** TMDB caps /discover/movie at page 500 (~10k movies total). */
export const TMDB_DISCOVER_PAGE_MAX = 500;

/** Axios per-request timeout. Generous enough for TMDB's worst-case TTFB. */
export const TMDB_HTTP_TIMEOUT_MS = 10_000;

/** Axios-retry: how many attempts after the first failure. */
export const TMDB_HTTP_RETRIES = 3;

/** HTTP status TMDB returns when bursts get throttled. */
export const TMDB_RATE_LIMIT_STATUS = 429;
