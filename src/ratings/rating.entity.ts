import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Check,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Movie } from '../movies/movie.entity';

// Per-user rating rows. Table named 'user_ratings' to make per-user-ness explicit
// in the schema; aggregate counters live on movies (rating_sum, rating_count).
//
// Surrogate PK + UNIQUE(user_id, movie_id): a rating is an entity with a value,
// not pure membership. Composite PK is reserved for join/membership tables.
@Entity('user_ratings')
@Unique('uq_user_ratings_user_movie', ['userId', 'movieId'])
@Check('chk_user_ratings_value_range', '"value" BETWEEN 1 AND 10')
export class Rating {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'movie_id', type: 'bigint' })
  movieId: string;

  @ManyToOne(() => Movie, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;

  @Column({ type: 'smallint' })
  value: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
