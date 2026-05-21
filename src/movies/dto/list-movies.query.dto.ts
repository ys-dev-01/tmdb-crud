import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  MOVIES_LIST_DEFAULT_LIMIT,
  MOVIES_LIST_MAX_LIMIT,
} from '../movies.constants';

/**
 * Query params accepted by GET /movies. All optional; defaults map to a
 * first-page request sorted by popularity.
 *
 * `genreIds` is comma-separated to keep the URL idiomatic: `?genreIds=1,2,3`.
 * The controller splits + validates the IDs; an empty string is rejected
 * by the Matches pattern (caller sends no key at all to skip filtering).
 */
export class ListMoviesQueryDto {
  @ApiPropertyOptional({
    description: 'Items per page',
    default: MOVIES_LIST_DEFAULT_LIMIT,
    maximum: MOVIES_LIST_MAX_LIMIT,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MOVIES_LIST_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from a prior response (meta.nextCursor).',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated genre IDs. Matches any (OR semantics). Example: 1,2,3',
    example: '1,2',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'genreIds must be a comma-separated list of integers',
  })
  genreIds?: string;
}
