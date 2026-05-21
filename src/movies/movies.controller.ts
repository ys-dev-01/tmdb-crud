import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ListMoviesQueryDto } from './dto/list-movies.query.dto';
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
}
