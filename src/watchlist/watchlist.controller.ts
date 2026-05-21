import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { ListWatchlistQueryDto } from './dto/list-watchlist.query.dto';
import { PaginatedWatchlistDto } from './dto/paginated-watchlist.dto';
import { WatchlistItemDto } from './dto/watchlist-item.dto';
import { WatchlistService } from './watchlist.service';

/**
 * /watchlist endpoints. The caller is always the JWT subject — the
 * URL never carries a userId. POST and DELETE take the movieId; GET
 * lists the caller's whole watchlist.
 */
@ApiTags('watchlist')
@ApiBearerAuth()
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly service: WatchlistService) {}

  @Post(':movieId')
  @ApiOperation({
    summary: 'Add a movie to the caller’s watchlist (idempotent)',
    description:
      'INSERT ON CONFLICT DO NOTHING — repeated calls return the same ' +
      'entry. 404 if the movie id is unknown.',
  })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiCreatedResponse({ type: WatchlistItemDto })
  @ApiNotFoundResponse({ description: 'No movie with that id' })
  add(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
  ): Promise<WatchlistItemDto> {
    return this.service.add(user.id, movieId);
  }

  @Delete(':movieId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a movie from the caller’s watchlist (idempotent)',
    description:
      '204 whether the entry existed or not — set-membership semantics.',
  })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
  ): Promise<void> {
    return this.service.remove(user.id, movieId);
  }

  @Get()
  @ApiOperation({
    summary: 'List the caller’s watchlist',
    description:
      'Cursor-paginated, most-recent first. Each row carries the full ' +
      'movie data plus the per-watchlist `addedAt` timestamp.',
  })
  @ApiOkResponse({ type: PaginatedWatchlistDto })
  list(
    @CurrentUser() user: User,
    @Query() query: ListWatchlistQueryDto,
  ): Promise<PaginatedWatchlistDto> {
    return this.service.list(user.id, query);
  }
}
