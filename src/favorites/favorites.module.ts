import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Movie } from '../movies/movie.entity';
import { FavoriteEntry } from './favorite.entity';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteEntry, Movie])],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
