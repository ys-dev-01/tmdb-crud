/**
 * Wire shapes for TMDB v3 API responses we consume.
 *
 * Kept narrow on purpose: we only declare the fields we read. Adding the
 * full TMDB schema would create a maintenance burden for fields we never use.
 */

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbGenresResponse {
  genres: TmdbGenre[];
}

/**
 * Shape of a single movie inside /discover/movie results.
 * /discover gives genre_ids (int[]); /movie/{id} gives a richer `genres`
 * object array. We only sync via /discover so this shape is enough.
 */
export interface TmdbMovieSummary {
  id: number;
  title: string;
  overview: string | null;
  release_date: string | null;
  poster_path: string | null;
  original_language: string;
  popularity: number;
  genre_ids: number[];
}

export interface TmdbDiscoverResponse {
  page: number;
  results: TmdbMovieSummary[];
  total_pages: number;
  total_results: number;
}
