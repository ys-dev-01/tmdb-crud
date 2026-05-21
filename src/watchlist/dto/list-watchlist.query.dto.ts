import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  WATCHLIST_LIST_DEFAULT_LIMIT,
  WATCHLIST_LIST_MAX_LIMIT,
} from '../watchlist.constants';

/**
 * Query params for GET /watchlist. No genre / search filtering — the
 * data set per user is small enough that listing in chronological order
 * is the entire UX.
 */
export class ListWatchlistQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: WATCHLIST_LIST_MAX_LIMIT,
    default: WATCHLIST_LIST_DEFAULT_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WATCHLIST_LIST_MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Opaque cursor from `meta.nextCursor` of the prior page.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
