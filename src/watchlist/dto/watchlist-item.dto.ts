import { ApiProperty } from '@nestjs/swagger';
import { MovieListItemDto } from '../../movies/dto/movie-list-item.dto';
import { Movie } from '../../movies/movie.entity';
import { WatchlistEntry } from '../watchlist.entity';

/**
 * One row in the GET /watchlist response. Extends MovieListItemDto with
 * `addedAt` so the client has the same movie fields as elsewhere plus
 * the per-watchlist timestamp.
 *
 * Inheritance over composition because the shape is identical to a
 * movie list item with one extra field — simpler than wrapping the
 * movie in a `{ movie, addedAt }` envelope.
 */
export class WatchlistItemDto extends MovieListItemDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-05-21T14:30:00.000Z',
    description: 'When the caller added this movie to their watchlist.',
  })
  addedAt: string;

  static fromEntry(entry: WatchlistEntry, movie: Movie): WatchlistItemDto {
    const base = MovieListItemDto.from(movie);
    const dto = Object.assign(new WatchlistItemDto(), base);
    dto.addedAt = entry.addedAt.toISOString();
    return dto;
  }
}
