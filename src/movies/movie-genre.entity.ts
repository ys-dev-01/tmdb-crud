import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Movie } from './movie.entity';
import { Genre } from '../genres/genre.entity';

// First-class join entity (not @ManyToMany sugar): gives us schema control and room
// to add columns later (e.g., is_primary_genre, confidence) without a relation refactor.
@Entity('movie_genres')
export class MovieGenre {
  @PrimaryColumn({ name: 'movie_id', type: 'bigint' })
  movieId: string;

  @PrimaryColumn({ name: 'genre_id', type: 'bigint' })
  genreId: string;

  @ManyToOne(() => Movie, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;

  @ManyToOne(() => Genre, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'genre_id' })
  genre: Genre;
}
