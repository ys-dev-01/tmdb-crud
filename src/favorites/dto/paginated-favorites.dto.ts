import { ApiProperty } from '@nestjs/swagger';
import { FavoriteItemDto } from './favorite-item.dto';

export class PaginatedFavoritesDto {
  @ApiProperty({ type: () => [FavoriteItemDto] })
  data: FavoriteItemDto[];

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
