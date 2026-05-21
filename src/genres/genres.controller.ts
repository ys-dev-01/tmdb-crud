import { Controller, Get } from '@nestjs/common';
import { GenresService } from './genres.service';
import { GenreDto } from './dto/genre.dto';

@Controller('genres')
export class GenresController {
  constructor(private readonly service: GenresService) {}

  @Get()
  async findAll(): Promise<GenreDto[]> {
    const genres = await this.service.findAll();
    return genres.map((g) => GenreDto.from(g));
  }
}
