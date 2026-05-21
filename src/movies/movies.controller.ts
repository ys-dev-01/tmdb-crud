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
import { SearchMoviesQueryDto } from './dto/search-movies.query.dto';
import { SearchResultDto } from './dto/search-result.dto';
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

  // MUST be declared before @Get(':id') — Express matches in declaration
  // order, so /movies/search would otherwise be captured by :id with id='search'.
  @Get('search')
  @ApiOperation({
    summary: 'Substring search over movie titles',
    description:
      'Case-insensitive substring match via the trigram-GIN-indexed title ' +
      'column. Results ordered by popularity DESC. Optional ?genreIds=1,2 ' +
      'narrows further (OR semantics within the genre filter).',
  })
  @ApiOkResponse({ type: SearchResultDto })
  search(@Query() query: SearchMoviesQueryDto): Promise<SearchResultDto> {
    return this.service.search(query);
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
