import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { Rating } from './rating.entity';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

/**
 * Ratings live in their own module (separate routes, separate cache
 * invalidation concerns) but share the Movie entity with MoviesModule.
 *
 * TypeOrmModule.forFeature registers both repositories; the service uses
 * DataSource directly for transactions, but the @InjectRepository
 * decorators in other code still need the registration.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Rating, Movie])],
  controllers: [RatingsController],
  providers: [RatingsService],
})
export class RatingsModule {}
