import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('genres')
export class Genre {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  // External TMDB identifier; surrogate PK above lets us swap providers without rekeying.
  @Column({ name: 'tmdb_id', type: 'integer', unique: true })
  tmdbId: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
