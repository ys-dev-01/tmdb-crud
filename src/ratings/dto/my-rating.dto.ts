import { ApiProperty } from '@nestjs/swagger';

/**
 * Response for GET /movies/:movieId/ratings/me. Just the caller's own
 * rating row — no movie aggregates (those live on /movies/:id).
 */
export class MyRatingDto {
  @ApiProperty({ minimum: 1, maximum: 10, example: 8 })
  value: number;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
