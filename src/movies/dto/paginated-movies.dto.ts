import { ApiProperty } from '@nestjs/swagger';
import { MovieListItemDto } from './movie-list-item.dto';

export class PaginationMetaDto {
  @ApiProperty({
    nullable: true,
    description:
      'Pass this back as ?cursor= to fetch the next page. null when no further pages.',
  })
  nextCursor: string | null;

  @ApiProperty()
  hasMore: boolean;
}

export class PaginatedMoviesDto {
  @ApiProperty({ type: [MovieListItemDto] })
  data: MovieListItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
