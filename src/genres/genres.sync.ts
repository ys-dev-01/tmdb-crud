import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from './genre.entity';
import { TmdbClient } from '../tmdb/tmdb.client';

@Injectable()
export class GenresSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GenresSyncService.name);

  constructor(
    private readonly tmdb: TmdbClient,
    @InjectRepository(Genre)
    private readonly repo: Repository<Genre>,
  ) {}

  // Runs after every module has been initialized; the DB connection is live
  // and TmdbClient has built its axios instance. Failure is logged and
  // swallowed — the app remains usable for non-TMDB paths.
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.sync();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Genres sync failed: ${msg}`);
    }
  }

  async sync(): Promise<number> {
    this.logger.log('Syncing genres from TMDB');
    const { genres } = await this.tmdb.fetchGenres();

    if (genres.length === 0) {
      this.logger.warn('TMDB returned 0 genres; skipping upsert');
      return 0;
    }

    // Single bulk upsert: ON CONFLICT (tmdb_id) DO UPDATE SET name = EXCLUDED.name.
    // updated_at bumps automatically via @UpdateDateColumn.
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(Genre)
      .values(genres.map((g) => ({ tmdbId: g.id, name: g.name })))
      .orUpdate(['name'], ['tmdb_id'])
      .execute();

    this.logger.log(`Synced ${genres.length} genres`);
    return genres.length;
  }
}
