import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { buildPaginator } from 'typeorm-cursor-pagination';
import { Movie } from '../movies/movie.entity';
import { ListWatchlistQueryDto } from './dto/list-watchlist.query.dto';
import { PaginatedWatchlistDto } from './dto/paginated-watchlist.dto';
import { WatchlistItemDto } from './dto/watchlist-item.dto';
import {
  WATCHLIST_CACHE_TTL_JITTER_MS,
  WATCHLIST_CACHE_TTL_MS,
  WATCHLIST_LIST_DEFAULT_LIMIT,
  WATCHLIST_VERSION_DEFAULT,
  WATCHLIST_VERSION_KEY_PREFIX,
  WATCHLIST_VERSION_TTL_MS,
} from './watchlist.constants';
import { WatchlistEntry } from './watchlist.entity';

/**
 * Per-user "movies I want to watch" set.
 *
 * Identity model: the watchlist row carries no data besides the
 * (user_id, movie_id) membership and the added_at timestamp. So:
 *
 *  - composite PK on (user_id, movie_id) instead of a surrogate id
 *  - POST is idempotent (INSERT ... ON CONFLICT DO NOTHING)
 *  - DELETE is idempotent (DELETE WHERE ... returns affected count we
 *    ignore — 204 either way)
 *
 * Reads use a single JOIN to fetch movie data alongside the watchlist
 * entry — no N+1, no separate movie lookup loop.
 *
 * Caching is per-user. A version key (`watchlist:version:{userId}`) is
 * bumped on every write by that user; list cache keys include the
 * version, so old entries become unreachable in O(1). One user's writes
 * don't blow another user's cache.
 */
@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(WatchlistEntry)
    private readonly repo: Repository<WatchlistEntry>,
    @InjectRepository(Movie) private readonly movieRepo: Repository<Movie>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Idempotently add a movie to the caller's watchlist.
   *
   * Pre-checks that the movie exists so the failure mode is a clean
   * 404, not a translated FK violation. The race window (movie deleted
   * between check and insert) is theoretical only — movies are only
   * mutated by the TMDB sync, never deleted.
   *
   * Returns the resulting watchlist item either way — newly inserted
   * or already present.
   */
  async add(userId: string, movieId: string): Promise<WatchlistItemDto> {
    const movie = await this.movieRepo.findOne({ where: { id: movieId } });
    if (!movie) {
      throw new NotFoundException(`Movie ${movieId} not found`);
    }

    // INSERT ... ON CONFLICT (user_id, movie_id) DO NOTHING.
    // TypeORM's upsert with empty overwrite isn't quite right here —
    // we want DO NOTHING, not DO UPDATE SET <nothing>. createQueryBuilder
    // with orIgnore() emits the correct SQL.
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(WatchlistEntry)
      .values({ userId, movieId })
      .orIgnore()
      .execute();

    const entry = await this.repo.findOneByOrFail({ userId, movieId });

    await this.bumpVersion(userId);
    return WatchlistItemDto.fromEntry(entry, movie);
  }

  /**
   * Idempotently remove a movie from the caller's watchlist. The
   * deleted-row count is intentionally ignored — 204 whether a row
   * was removed or it was already absent. Set-membership semantics:
   * the user's intent is "ensure this is not in my watchlist."
   */
  async remove(userId: string, movieId: string): Promise<void> {
    await this.repo.delete({ userId, movieId });
    await this.bumpVersion(userId);
  }

  /**
   * Paginated read of the caller's watchlist, most-recent first.
   *
   * The query JOINs movies so each row carries full movie data — one
   * round-trip per page, no N+1. Pagination keys are on the
   * WatchlistEntry side (`addedAt` for sort, `movieId` as tiebreaker).
   */
  async list(
    userId: string,
    query: ListWatchlistQueryDto,
  ): Promise<PaginatedWatchlistDto> {
    const limit = query.limit ?? WATCHLIST_LIST_DEFAULT_LIMIT;
    const version = await this.getVersion(userId);
    const cacheKey = `watchlist:${userId}:v${version}:${query.cursor ?? ''}:${limit}`;

    const cached = await this.cache.get<PaginatedWatchlistDto>(cacheKey);
    if (cached) return cached;

    const qb = this.repo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.movie', 'm')
      .where('w.user_id = :userId', { userId });

    const paginator = buildPaginator({
      entity: WatchlistEntry,
      alias: 'w',
      paginationKeys: ['addedAt', 'movieId'],
      query: {
        limit,
        order: 'DESC',
        afterCursor: query.cursor,
      },
    });

    const { data, cursor } = await paginator.paginate(qb);

    const result: PaginatedWatchlistDto = {
      data: data.map((entry) => WatchlistItemDto.fromEntry(entry, entry.movie)),
      meta: {
        nextCursor: cursor.afterCursor,
        hasMore: cursor.afterCursor !== null,
      },
    };

    await this.cache.set(cacheKey, result, this.ttlMs());
    return result;
  }

  private ttlMs(): number {
    return (
      WATCHLIST_CACHE_TTL_MS +
      Math.floor(Math.random() * WATCHLIST_CACHE_TTL_JITTER_MS)
    );
  }

  private versionKey(userId: string): string {
    return `${WATCHLIST_VERSION_KEY_PREFIX}${userId}`;
  }

  private async getVersion(userId: string): Promise<string> {
    const v = await this.cache.get<string>(this.versionKey(userId));
    return v ?? WATCHLIST_VERSION_DEFAULT;
  }

  /**
   * Per-user version bump. Old `watchlist:{userId}:v{old}:*` entries
   * become unreachable. Only this user's cache is touched — other
   * users keep their cached pages.
   */
  private async bumpVersion(userId: string): Promise<void> {
    await this.cache.set(
      this.versionKey(userId),
      String(Date.now()),
      WATCHLIST_VERSION_TTL_MS,
    );
  }
}
