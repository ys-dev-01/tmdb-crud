import { ApiProperty } from '@nestjs/swagger';
import { MovieListItemDto } from '../../movies/dto/movie-list-item.dto';
import { Movie } from '../../movies/movie.entity';
import { FavoriteEntry } from '../favorite.entity';

/**
 * One row in the GET /favorites response. Extends MovieListItemDto
 * with `addedAt` — same shape contract as WatchlistItemDto.
 */
export class FavoriteItemDto extends MovieListItemDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-05-21T14:30:00.000Z',
    description: 'When the caller added this movie to their favorites.',
  })
  addedAt: string;

  static fromEntry(entry: FavoriteEntry, movie: Movie): FavoriteItemDto {
    const base = MovieListItemDto.from(movie);
    const dto = Object.assign(new FavoriteItemDto(), base);
    dto.addedAt = entry.addedAt.toISOString();
    return dto;
  }
}
