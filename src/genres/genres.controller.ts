import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenresService } from './genres.service';
import { GenreDto } from './dto/genre.dto';

@ApiTags('genres')
@Controller('genres')
export class GenresController {
  constructor(private readonly service: GenresService) {}

  @Get()
  @ApiOperation({
    summary: 'List all genres',
    description:
      'Returns every TMDB-mirrored genre, alphabetized by name. The catalog ' +
      'is small (~19 entries) so pagination is not exposed.',
  })
  @ApiOkResponse({ type: [GenreDto] })
  async findAll(): Promise<GenreDto[]> {
    const genres = await this.service.findAll();
    return genres.map((g) => GenreDto.from(g));
  }
}
