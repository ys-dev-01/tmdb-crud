/**
 * Default for MOVIES_SYNC_MAX_PAGES. Five pages = ~100 movies; enough to
 * demo pagination + filtering with a fast first boot. Override via env in
 * prod to backfill more of TMDB's catalog.
 */
export const MOVIES_SYNC_DEFAULT_MAX_PAGES = 5;
