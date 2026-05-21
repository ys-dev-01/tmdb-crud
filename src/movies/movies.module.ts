import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TmdbModule } from '../tmdb/tmdb.module';
import { Movie } from './movie.entity';
import { MovieGenre } from './movie-genre.entity';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { MoviesSyncService } from './movies.sync';

@Module({
  imports: [
    // Registers Movie + MovieGenre entities with the connection. The sync
    // service goes through the EntityManager directly (via @InjectDataSource)
    // because it needs transactional access across both entities + Genre.
    TypeOrmModule.forFeature([Movie, MovieGenre]),
    TmdbModule,
  ],
  controllers: [MoviesController],
  providers: [MoviesService, MoviesSyncService],
})
export class MoviesModule {}
