import { ApiProperty } from '@nestjs/swagger';
import { Genre } from '../genre.entity';

/**
 * API response shape for a genre. Decouples the wire contract from the
 * entity — internal columns (created_at, updated_at) stay out of the
 * response, and DB-side renames don't break consumers.
 */
export class GenreDto {
  @ApiProperty({
    description: 'Internal database identifier (bigint as string).',
    example: '1',
  })
  id: string;

  @ApiProperty({
    description: 'TMDB-side genre id; stable across our DB resets.',
    example: 28,
  })
  tmdbId: number;

  @ApiProperty({
    description: 'Display name from TMDB.',
    example: 'Action',
  })
  name: string;

  static from(g: Genre): GenreDto {
    const dto = new GenreDto();
    dto.id = g.id;
    dto.tmdbId = g.tmdbId;
    dto.name = g.name;
    return dto;
  }
}
