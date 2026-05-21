import { ApiProperty } from '@nestjs/swagger';
import { WatchlistItemDto } from './watchlist-item.dto';

/**
 * Same envelope shape as PaginatedMoviesDto — keeps the client side
 * uniform across all paginated list endpoints.
 */
export class PaginatedWatchlistDto {
  @ApiProperty({ type: () => [WatchlistItemDto] })
  data: WatchlistItemDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      nextCursor: { type: 'string', nullable: true },
      hasMore: { type: 'boolean' },
    },
  })
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}
