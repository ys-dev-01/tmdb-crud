import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { RATING_VALUE_MAX, RATING_VALUE_MIN } from '../ratings.constants';

/**
 * Body for PUT /movies/:movieId/ratings.
 *
 * `value` is the rating the caller wants to record for this movie.
 * Integer constraint mirrors the smallint column + CHECK on user_ratings;
 * class-validator catches it at the edge so we never run a transaction
 * that the DB would just reject.
 */
export class RateMovieBodyDto {
  @ApiProperty({
    minimum: RATING_VALUE_MIN,
    maximum: RATING_VALUE_MAX,
    example: 8,
    description: 'Rating value, integer 1-10.',
  })
  @IsInt()
  @Min(RATING_VALUE_MIN)
  @Max(RATING_VALUE_MAX)
  value: number;
}
