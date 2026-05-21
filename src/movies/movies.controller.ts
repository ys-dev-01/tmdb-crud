import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ListMoviesQueryDto } from './dto/list-movies.query.dto';
import { MovieDetailDto } from './dto/movie-detail.dto';
import { PaginatedMoviesDto } from './dto/paginated-movies.dto';
import { MoviesService } from './movies.service';

@ApiTags('movies')
@ApiBearerAuth()
@Controller('movies')
export class MoviesController {
  constructor(private readonly service: MoviesService) {}

  @Get()
  @ApiOperation({
    summary: 'List movies (cursor-paginated, optional genre filter)',
    description:
      'Sorted by popularity descending. Use `meta.nextCursor` as `?cursor=` ' +
      'to fetch the following page. `?genreIds=1,2,3` filters to movies in ' +
      'any of the given genres (OR semantics).',
  })
  @ApiOkResponse({ type: PaginatedMoviesDto })
  list(@Query() query: ListMoviesQueryDto): Promise<PaginatedMoviesDto> {
    return this.service.findMany(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Movie detail with embedded genres',
    description:
      'Returns one movie by internal id (bigint as string) with its full ' +
      'genres array. 404 if the id does not exist.',
  })
  @ApiParam({ name: 'id', example: '1' })
  @ApiOkResponse({ type: MovieDetailDto })
  @ApiNotFoundResponse({ description: 'No movie with that id' })
  findOne(@Param('id') id: string): Promise<MovieDetailDto> {
    return this.service.findOne(id);
  }
}
