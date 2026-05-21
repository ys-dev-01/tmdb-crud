import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { WatchlistController } from './watchlist.controller';
import { WatchlistEntry } from './watchlist.entity';
import { WatchlistService } from './watchlist.service';

/**
 * Watchlist has its own module — it doesn't own the Movie entity, but
 * registers it via TypeOrmModule.forFeature so the service can inject
 * Movie's repository for the existence pre-check on POST.
 */
@Module({
  imports: [TypeOrmModule.forFeature([WatchlistEntry, Movie])],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
