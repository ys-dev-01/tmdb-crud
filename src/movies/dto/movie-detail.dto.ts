import { ApiProperty } from '@nestjs/swagger';
import { GenreDto } from '../../genres/dto/genre.dto';
import { Genre } from '../../genres/genre.entity';
import { Movie } from '../movie.entity';
import { MovieListItemDto } from './movie-list-item.dto';

/**
 * GET /movies/:id response. Same fields as the list shape plus an embedded
 * `genres` array. The N+1 alternative — clients calling /genres after each
 * /movies/:id — is wasteful when the genre catalog is small and stable;
 * inlining keeps the contract self-contained.
 */
export class MovieDetailDto extends MovieListItemDto {
  @ApiProperty({ type: [GenreDto] })
  genres: GenreDto[];

  static fromWithGenres(m: Movie, genres: Genre[]): MovieDetailDto {
    const base = MovieListItemDto.from(m);
    const dto = Object.assign(new MovieDetailDto(), base);
    dto.genres = genres.map((g) => GenreDto.from(g));
    return dto;
  }
}
