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
