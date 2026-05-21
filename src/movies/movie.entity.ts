import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('movies')
export class Movie {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'tmdb_id', type: 'integer', unique: true })
  tmdbId: number;

  @Column({ type: 'varchar', length: 512 })
  title: string;

  @Column({ type: 'text', nullable: true })
  overview: string | null;

  // DATE (not TIMESTAMPTZ): release date is a calendar date, no clock or timezone.
  // pg returns it as 'YYYY-MM-DD' string; keep as string end-to-end to avoid TZ confusion.
  @Column({ name: 'release_date', type: 'date', nullable: true })
  releaseDate: string | null;

  // Relative path from TMDB (e.g., '/abc123.jpg'). Client constructs the full URL.
  @Column({ name: 'poster_path', type: 'varchar', length: 255, nullable: true })
  posterPath: string | null;

  @Column({
    name: 'original_language',
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  originalLanguage: string | null;

  // double precision (not numeric): TMDB popularity is a relative score, not
  // a financial amount. Float is enough; pg returns it as a JS number.
  //
  // TS type is `number` (not `number | null`) even though the SQL column is
  // nullable. Reason: typeorm-cursor-pagination reads field types via TS
  // reflection metadata. A `number | null` union reflects as `Object`, which
  // the lib can't encode/decode. Sync always populates popularity from TMDB
  // (which never omits it), so the type stays honest in practice.
  @Column({ type: 'double precision', nullable: true })
  popularity: number;

  // Denormalized aggregates for O(1) avg-rating reads. Kept in sync transactionally
  // by the ratings service (PR #8). AVG on read = rating_sum / NULLIF(rating_count, 0).
  // BIGINT for sum: SMALLINT * unbounded count needs room; INT4 would cap around 2B/10.
  @Column({ name: 'rating_sum', type: 'bigint', default: 0 })
  ratingSum: string;

  @Column({ name: 'rating_count', type: 'integer', default: 0 })
  ratingCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
