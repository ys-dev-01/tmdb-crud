import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { MyRatingDto } from './dto/my-rating.dto';
import { RateMovieBodyDto } from './dto/rate-movie.body.dto';
import { RatingResponseDto } from './dto/rating-response.dto';
import { RatingsService } from './ratings.service';

/**
 * Nested under /movies/:movieId for URL discoverability — a rating is
 * always scoped to a movie. The :movieId path param is the only place
 * the movie comes from; the user comes from the JWT.
 */
@ApiTags('ratings')
@ApiBearerAuth()
@Controller('movies/:movieId/ratings')
export class RatingsController {
  constructor(private readonly service: RatingsService) {}

  @Put()
  @ApiOperation({
    summary: 'Upsert the caller’s rating for a movie',
    description:
      'PUT semantics: creates the rating if absent, replaces it if ' +
      'present. Returns the updated rating plus the recomputed movie ' +
      'aggregates so the client can refresh its in-memory copy.',
  })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiOkResponse({ type: RatingResponseDto })
  @ApiNotFoundResponse({ description: 'No movie with that id' })
  rate(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
    @Body() body: RateMovieBodyDto,
  ): Promise<RatingResponseDto> {
    return this.service.upsert(user.id, movieId, body.value);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove the caller’s rating for a movie',
    description:
      'Strict 404 if the caller has no rating on this movie — DELETE ' +
      'of a specific resource that doesn’t exist is a client mistake, ' +
      'not an idempotent no-op.',
  })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    description: 'Movie unknown OR caller hasn’t rated it',
  })
  unrate(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
  ): Promise<void> {
    return this.service.remove(user.id, movieId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Read the caller’s rating for a movie' })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiOkResponse({ type: MyRatingDto })
  @ApiNotFoundResponse({ description: 'Caller has no rating for this movie' })
  mine(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
  ): Promise<MyRatingDto> {
    return this.service.findMine(user.id, movieId);
  }
}
