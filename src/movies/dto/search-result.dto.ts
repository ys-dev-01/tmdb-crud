import { ApiProperty } from '@nestjs/swagger';
import { MovieListItemDto } from './movie-list-item.dto';

export class SearchResultDto {
  @ApiProperty({ type: [MovieListItemDto] })
  data: MovieListItemDto[];

  @ApiProperty({ description: 'Total matches (may exceed data.length).' })
  total: number;
}
