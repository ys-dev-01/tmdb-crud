/**
 * Thrown by TmdbClient when an upstream TMDB call fails after retries.
 * Callers can branch on `statusCode` (e.g., 404 means "not in TMDB",
 * 5xx / undefined means "upstream broken").
 */
export class TmdbError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}
