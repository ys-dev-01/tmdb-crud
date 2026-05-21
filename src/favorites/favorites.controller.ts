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
import { FavoriteItemDto } from './dto/favorite-item.dto';
import { ListFavoritesQueryDto } from './dto/list-favorites.query.dto';
import { PaginatedFavoritesDto } from './dto/paginated-favorites.dto';
import { FavoritesService } from './favorites.service';

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly service: FavoritesService) {}

  @Post(':movieId')
  @ApiOperation({
    summary: 'Add a movie to the caller’s favorites (idempotent)',
    description:
      'INSERT ON CONFLICT DO NOTHING — repeated calls return the same ' +
      'entry. 404 if the movie id is unknown.',
  })
  @ApiParam({ name: 'movieId', example: '1' })
  @ApiCreatedResponse({ type: FavoriteItemDto })
  @ApiNotFoundResponse({ description: 'No movie with that id' })
  add(
    @CurrentUser() user: User,
    @Param('movieId') movieId: string,
  ): Promise<FavoriteItemDto> {
    return this.service.add(user.id, movieId);
  }

  @Delete(':movieId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove a movie from the caller’s favorites (idempotent)',
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
    summary: 'List the caller’s favorites',
    description:
      'Cursor-paginated, most-recent first. Each row carries the full ' +
      'movie data plus the per-favorite `addedAt` timestamp.',
  })
  @ApiOkResponse({ type: PaginatedFavoritesDto })
  list(
    @CurrentUser() user: User,
    @Query() query: ListFavoritesQueryDto,
  ): Promise<PaginatedFavoritesDto> {
    return this.service.list(user.id, query);
  }
}
