import {
  Entity,
  PrimaryColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';

// Composite PK (user_id, movie_id): pure membership row, no surrogate id.
// Separate table from watchlist — semantically independent (a movie can be in both)
// and lets each evolve independently if features diverge later.
@Entity('favorites')
export class FavoriteEntry {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  @PrimaryColumn({ name: 'movie_id', type: 'bigint' })
  movieId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Movie, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt: Date;
}
