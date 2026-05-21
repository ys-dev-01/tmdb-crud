import { ApiProperty } from '@nestjs/swagger';

/**
 * Movie-level rating aggregates included in the PUT response so the
 * client can update its UI without a round-trip to GET /movies/:id.
 *
 * `avgRating` is null when ratingCount = 0 — but after a successful
 * PUT it will be a number; the optionality is kept for shape consistency
 * with MovieListItemDto.
 */
export class RatingMovieAggregatesDto {
  @ApiProperty({ nullable: true, description: 'Average rating, 1-10.' })
  avgRating: number | null;

  @ApiProperty({ description: 'Total ratings counted into avg.' })
  ratingCount: number;
}

/**
 * Response for PUT /movies/:movieId/ratings.
 *
 * Includes:
 *  - the rating that's now recorded for the calling user (value + updatedAt)
 *  - the freshly-recomputed movie aggregates (avgRating + ratingCount)
 *
 * The second piece lets the client refresh its in-memory copy of the
 * movie row in the same round-trip. Without it, a typical client would
 * follow every PUT with a GET /movies/:id, which is wasteful given we
 * just computed the new aggregates server-side.
 */
export class RatingResponseDto {
  @ApiProperty({ minimum: 1, maximum: 10, example: 8 })
  value: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-05-21T14:30:00.000Z',
  })
  updatedAt: string;

  @ApiProperty({ type: () => RatingMovieAggregatesDto })
  movie: RatingMovieAggregatesDto;
}
