import { ApiProperty } from '@nestjs/swagger';
import { Movie } from '../movie.entity';

/**
 * Shape of one row in the GET /movies response.
 *
 * `avgRating` is derived from the denormalized rating_sum / rating_count
 * columns on the movies row (O(1) read, no join). `null` distinguishes
 * "no ratings yet" from "rated zero"; clients should display N/A for null
 * and a numeric value otherwise.
 */
export class MovieListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tmdbId: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ nullable: true })
  overview: string | null;

  @ApiProperty({ nullable: true, example: '1999-10-15' })
  releaseDate: string | null;

  @ApiProperty({ nullable: true, example: '/abc.jpg' })
  posterPath: string | null;

  @ApiProperty({ nullable: true, example: 'en' })
  originalLanguage: string | null;

  @ApiProperty()
  popularity: number;

  @ApiProperty({ nullable: true, description: 'Average user rating (1-10)' })
  avgRating: number | null;

  @ApiProperty()
  ratingCount: number;

  static from(m: Movie): MovieListItemDto {
    const dto = new MovieListItemDto();
    dto.id = m.id;
    dto.tmdbId = m.tmdbId;
    dto.title = m.title;
    dto.overview = m.overview;
    dto.releaseDate = m.releaseDate;
    dto.posterPath = m.posterPath;
    dto.originalLanguage = m.originalLanguage;
    dto.popularity = m.popularity;
    dto.ratingCount = m.ratingCount;
    // rating_sum is bigint (string in JS); only divide when ratingCount > 0.
    dto.avgRating =
      m.ratingCount > 0 ? parseFloat(m.ratingSum) / m.ratingCount : null;
    return dto;
  }
}
