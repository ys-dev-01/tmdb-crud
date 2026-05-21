import { Genre } from '../genre.entity';

/**
 * API response shape for a genre. Decouples the wire contract from the
 * entity — internal columns (created_at, updated_at) stay out of the
 * response, and DB-side renames don't break consumers.
 */
export class GenreDto {
  id: string;
  tmdbId: number;
  name: string;

  static from(g: Genre): GenreDto {
    const dto = new GenreDto();
    dto.id = g.id;
    dto.tmdbId = g.tmdbId;
    dto.name = g.name;
    return dto;
  }
}
