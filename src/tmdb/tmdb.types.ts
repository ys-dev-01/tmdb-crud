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
