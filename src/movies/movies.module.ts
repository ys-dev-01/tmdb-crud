import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Genre } from '../genres/genre.entity';
import { TmdbModule } from '../tmdb/tmdb.module';
import { Movie } from './movie.entity';
import { MovieGenre } from './movie-genre.entity';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { MoviesSyncService } from './movies.sync';

@Module({
  imports: [
    // Registers Movie + MovieGenre entities with the connection. Genre is
    // also registered here (in addition to GenresModule) so MoviesService
    // can inject its repository for the detail endpoint's genres lookup.
    // forFeature can be called from multiple modules safely — TypeORM
    // tracks entities at the connection level, not per-module.
    TypeOrmModule.forFeature([Movie, MovieGenre, Genre]),
    TmdbModule,
  ],
  controllers: [MoviesController],
  providers: [MoviesService, MoviesSyncService],
})
export class MoviesModule {}
