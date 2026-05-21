import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Cache } from 'cache-manager';
import { DataSource, EntityManager } from 'typeorm';
import {
  MOVIES_RATING_VERSION_KEY,
  MOVIES_RATING_VERSION_TTL_MS,
} from '../movies/movies.constants';
import { Movie } from '../movies/movie.entity';
import { Rating } from './rating.entity';
import { MyRatingDto } from './dto/my-rating.dto';
import { RatingResponseDto } from './dto/rating-response.dto';

/**
 * Write-side for ratings.
 *
 * Why a service this small needs so much care: ratings drive the
 * denormalized rating_sum / rating_count counters on the movies table.
 * Those counters are what GET /movies and GET /movies/:id read for their
 * O(1) avg-rating. If a write here drifts even once, the counters are
 * permanently wrong until a reconcile job runs — so correctness is
 * structural, not best-effort.
 *
 * Concurrency model:
 *   Every mutation runs inside a transaction that opens with a
 *   SELECT … FOR UPDATE on the target movies row. That row-level lock
 *   serializes ALL rating writes for that movie (across all users):
 *
 *     - same-user double PUT  → second waits for first; computes its
 *       Δsum from the already-committed first state.
 *     - different-users PUT   → second waits; both Δsums apply cleanly.
 *     - PUT racing DELETE     → whichever grabs the lock first wins;
 *       second sees the post-first state and computes correctly.
 *
 *   Locking the movies row is heavier than locking just the
 *   user_ratings row, but it's the only approach that handles the
 *   "no rating yet → two concurrent PUTs" case correctly. SELECT FOR
 *   UPDATE on a non-existent row doesn't lock anything; two
 *   transactions would both see "no rating" and both increment count.
 *
 * Cache invalidation runs AFTER the transaction commits — never inside.
 * Invalidating before commit opens a window where a reader sees the
 * pre-commit DB state and re-populates the cache with stale data.
 */
@Injectable()
export class RatingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Upsert the caller's rating for `movieId`. Returns the new rating
   * plus the recomputed movie aggregates so the client can refresh its
   * in-memory copy without a follow-up GET.
   */
  async upsert(
    userId: string,
    movieId: string,
    value: number,
  ): Promise<RatingResponseDto> {
    const result = await this.dataSource.transaction(async (manager) => {
      const movie = await this.lockMovie(manager, movieId);
      const ratingRepo = manager.getRepository(Rating);

      // Now safe to read — no other transaction can mutate this movie's
      // ratings while we hold the lock above.
      const existing = await ratingRepo.findOneBy({ userId, movieId });

      const deltaSum = existing ? value - existing.value : value;
      const deltaCount = existing ? 0 : 1;

      // Single-statement INSERT ... ON CONFLICT DO UPDATE. The lock on
      // the movies row already prevents races; this just makes both
      // create and update share one code path.
      await ratingRepo.upsert(
        { userId, movieId, value },
        { conflictPaths: ['userId', 'movieId'] },
      );

      await this.applyCounterDelta(manager, movieId, deltaSum, deltaCount);

      const refreshed = await ratingRepo.findOneByOrFail({ userId, movieId });

      // rating_sum is bigint → string in JS. Use BigInt for the add and
      // Number() at the end for the avg division.
      const newSum = BigInt(movie.ratingSum) + BigInt(deltaSum);
      const newCount = movie.ratingCount + deltaCount;
      const avgRating = newCount > 0 ? Number(newSum) / newCount : null;

      return {
        value: refreshed.value,
        updatedAt: refreshed.updatedAt.toISOString(),
        movie: { avgRating, ratingCount: newCount },
      } satisfies RatingResponseDto;
    });

    await this.invalidate(movieId);
    return result;
  }

  /**
   * Remove the caller's rating for `movieId`. Throws 404 if the movie
   * doesn't exist OR if the caller hasn't rated it — DELETE of a
   * specific resource that doesn't exist is a client mistake, not an
   * idempotent no-op.
   */
  async remove(userId: string, movieId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.lockMovie(manager, movieId);
      const ratingRepo = manager.getRepository(Rating);

      const existing = await ratingRepo.findOneBy({ userId, movieId });
      if (!existing) {
        throw new NotFoundException(`You have not rated movie ${movieId}`);
      }

      await ratingRepo.delete({ userId, movieId });
      await this.applyCounterDelta(manager, movieId, -existing.value, -1);
    });

    await this.invalidate(movieId);
  }

  /**
   * Read the caller's own rating for `movieId`. No cache — single-row
   * lookup on a UNIQUE index is already O(1) on the DB side, and a
   * per-user cache key adds complexity for no real win.
   */
  async findMine(userId: string, movieId: string): Promise<MyRatingDto> {
    const rating = await this.dataSource.getRepository(Rating).findOneBy({
      userId,
      movieId,
    });
    if (!rating) {
      throw new NotFoundException(`You have not rated movie ${movieId}`);
    }
    return {
      value: rating.value,
      updatedAt: rating.updatedAt.toISOString(),
    };
  }

  /**
   * SELECT … FOR UPDATE on the movies row. Throws 404 if the id is
   * unknown. Holds the row-level lock for the rest of the transaction.
   */
  private async lockMovie(
    manager: EntityManager,
    movieId: string,
  ): Promise<Movie> {
    const movie = await manager
      .getRepository(Movie)
      .createQueryBuilder('m')
      .setLock('pessimistic_write')
      .where('m.id = :id', { id: movieId })
      .getOne();
    if (!movie) {
      throw new NotFoundException(`Movie ${movieId} not found`);
    }
    return movie;
  }

  /**
   * Apply `(Δsum, Δcount)` to the movies row counters atomically.
   * Uses raw SQL expressions (`rating_sum + :deltaSum`) so the update
   * is a single statement that doesn't read-then-write — safe under
   * the row lock from `lockMovie`, but also defensive if that ever
   * gets lifted.
   */
  private async applyCounterDelta(
    manager: EntityManager,
    movieId: string,
    deltaSum: number,
    deltaCount: number,
  ): Promise<void> {
    await manager
      .getRepository(Movie)
      .createQueryBuilder()
      .update(Movie)
      .set({
        ratingSum: () => `rating_sum + :deltaSum`,
        ratingCount: () => `rating_count + :deltaCount`,
      })
      .where('id = :id', { id: movieId })
      .setParameters({ deltaSum, deltaCount })
      .execute();
  }

  /**
   * Bust the caches that depend on this movie's avg rating.
   * - `movies:detail:{id}` → direct del (key is enumerable from the id).
   * - `movies:list:*` and `movies:search:*` → bump the shared version
   *   key. MoviesService reads the version when constructing list/search
   *   cache keys, so a bump renders all previously-cached entries
   *   unreachable. They expire from Redis on their own TTL.
   */
  private async invalidate(movieId: string): Promise<void> {
    await Promise.all([
      this.cache.del(`movies:detail:${movieId}`),
      this.cache.set(
        MOVIES_RATING_VERSION_KEY,
        String(Date.now()),
        MOVIES_RATING_VERSION_TTL_MS,
      ),
    ]);
  }
}
