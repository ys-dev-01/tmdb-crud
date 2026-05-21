import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Genre } from '../genres/genre.entity';
import { TmdbClient } from '../tmdb/tmdb.client';
import { TmdbMovieSummary } from '../tmdb/tmdb.types';
import { MovieGenre } from './movie-genre.entity';
import { Movie } from './movie.entity';
import { MOVIES_SYNC_DEFAULT_MAX_PAGES } from './movies.constants';

/**
 * Pulls movies from TMDB's /discover/movie endpoint and upserts them into
 * the `movies` table plus the `movie_genres` join table.
 *
 * Runs on app bootstrap and (after the next commit) on a daily cron. Each
 * page is processed inside its own transaction: a bulk INSERT … ON CONFLICT
 * for movies, then a delete-and-reinsert of that batch's movie_genres rows.
 * Failure of any page is logged and swallowed so the app stays usable;
 * subsequent pages still run.
 *
 * Genre links use a "diff would be cheaper but harder" tradeoff: per batch,
 * we DELETE all existing movie_genres rows for the affected movies and
 * INSERT the current set. Idempotent, two queries per batch instead of N+1,
 * and easy to reason about. The genre catalog is small (~19 rows) so the
 * in-memory tmdb_id → our PK map is cheap to build.
 *
 * Update columns intentionally OMIT rating_sum / rating_count: those are
 * denormalized counters owned by the ratings service (PR #8) and the sync
 * must not stomp them.
 */
@Injectable()
export class MoviesSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MoviesSyncService.name);
  private readonly maxPages: number;

  constructor(
    private readonly tmdb: TmdbClient,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.maxPages =
      config.get<number>('MOVIES_SYNC_MAX_PAGES') ??
      MOVIES_SYNC_DEFAULT_MAX_PAGES;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.runSync('Initial');
  }

  // 4 AM UTC daily. Late enough to be off-peak in every timezone, low
  // overlap with most app activity. The TMDB catalog changes maybe a few
  // times per week, so daily is plenty.
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'movies-daily-sync' })
  async dailySync(): Promise<void> {
    await this.runSync('Daily');
  }

  private async runSync(label: string): Promise<void> {
    try {
      const total = await this.sync();
      this.logger.log(`${label} movies sync complete: ${total} movies`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`${label} movies sync failed: ${msg}`);
    }
  }

  async sync(): Promise<number> {
    this.logger.log(`Syncing up to ${this.maxPages} pages from TMDB`);
    let total = 0;

    for (let page = 1; page <= this.maxPages; page++) {
      const response = await this.tmdb.fetchDiscoverMovies(page);
      if (response.results.length === 0) break;

      await this.upsertBatch(response.results);
      total += response.results.length;

      // TMDB sometimes returns fewer pages than requested; respect the cap.
      if (page >= response.total_pages) break;
    }

    this.logger.log(`Synced ${total} movies`);
    return total;
  }

  private async upsertBatch(batch: TmdbMovieSummary[]): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      // 1. Bulk upsert movies. Omits rating_sum / rating_count from the
      //    update list — those are owned by the ratings write path.
      await tx
        .createQueryBuilder()
        .insert()
        .into(Movie)
        .values(
          batch.map((m) => ({
            tmdbId: m.id,
            title: m.title,
            overview: m.overview,
            releaseDate: m.release_date,
            posterPath: m.poster_path,
            originalLanguage: m.original_language,
            popularity: String(m.popularity),
          })),
        )
        .orUpdate(
          [
            'title',
            'overview',
            'release_date',
            'poster_path',
            'original_language',
            'popularity',
          ],
          ['tmdb_id'],
        )
        .execute();

      const tmdbIds = batch.map((m) => m.id);
      const movies = await tx.find(Movie, {
        where: { tmdbId: In(tmdbIds) },
        select: { id: true, tmdbId: true },
      });
      const tmdbToOurMovieId = new Map(movies.map((m) => [m.tmdbId, m.id]));

      const allGenreTmdbIds = [...new Set(batch.flatMap((m) => m.genre_ids))];
      if (allGenreTmdbIds.length === 0) return;

      const genres = await tx.find(Genre, {
        where: { tmdbId: In(allGenreTmdbIds) },
        select: { id: true, tmdbId: true },
      });
      const tmdbToOurGenreId = new Map(genres.map((g) => [g.tmdbId, g.id]));

      const newLinks: { movieId: string; genreId: string }[] = [];
      for (const m of batch) {
        const movieId = tmdbToOurMovieId.get(m.id);
        if (!movieId) continue;
        for (const gTmdbId of m.genre_ids) {
          const genreId = tmdbToOurGenreId.get(gTmdbId);
          if (!genreId) continue;
          newLinks.push({ movieId, genreId });
        }
      }

      const movieIds = movies.map((m) => m.id);
      // Delete-then-insert per batch keeps the join table in lockstep with
      // TMDB's current genre assignment. ON DELETE CASCADE on movie_genres
      // means deleted movies clean up automatically, so we never orphan.
      await tx.delete(MovieGenre, { movieId: In(movieIds) });
      if (newLinks.length > 0) {
        await tx
          .createQueryBuilder()
          .insert()
          .into(MovieGenre)
          .values(newLinks)
          .execute();
      }
    });
  }
}
