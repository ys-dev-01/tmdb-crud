import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from './genre.entity';
import { GenresController } from './genres.controller';
import { GenresService } from './genres.service';
import { GenresSyncService } from './genres.sync';
import { TmdbModule } from '../tmdb/tmdb.module';

@Module({
  imports: [
    // Registers Repository<Genre> in this module's DI scope.
    TypeOrmModule.forFeature([Genre]),
    // Brings TmdbClient into scope for GenresSyncService.
    TmdbModule,
  ],
  controllers: [GenresController],
  providers: [GenresService, GenresSyncService],
})
export class GenresModule {}
