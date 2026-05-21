import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  MOVIES_LIST_DEFAULT_LIMIT,
  MOVIES_LIST_MAX_LIMIT,
  MOVIES_SEARCH_MIN_QUERY_LENGTH,
  MOVIES_SEARCH_MAX_QUERY_LENGTH,
} from '../movies.constants';

/**
 * Query params for GET /movies/search. Unlike /movies, no cursor here:
 * top-N results ordered by popularity is the natural search contract,
 * and ranking-based pagination has known stability issues under data
 * changes.
 */
export class SearchMoviesQueryDto {
  @ApiProperty({
    description: 'Search term against movie title (ILIKE substring match)',
    minLength: MOVIES_SEARCH_MIN_QUERY_LENGTH,
    maxLength: MOVIES_SEARCH_MAX_QUERY_LENGTH,
    example: 'venom',
  })
  @IsString()
  @MinLength(MOVIES_SEARCH_MIN_QUERY_LENGTH)
  @MaxLength(MOVIES_SEARCH_MAX_QUERY_LENGTH)
  q: string;

  @ApiPropertyOptional({
    description: 'Items returned',
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
    description:
      'Comma-separated genre IDs to further narrow results. OR semantics.',
    example: '1,28',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(,\d+)*$/, {
    message: 'genreIds must be a comma-separated list of integers',
  })
  genreIds?: string;
}
