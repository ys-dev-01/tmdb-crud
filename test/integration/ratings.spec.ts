/**
 * Integration tests for RatingsService against a real Postgres
 * testcontainer.
 *
 * The interesting properties to assert here are all SQL-level:
 *   - rating_sum / rating_count counters track every transition correctly
 *   - the FOR UPDATE lock on the movies row serializes concurrent writes
 *     so two same-user PUTs produce exactly one row (not two), and two
 *     different-user PUTs both apply
 *   - 404 paths reach the DB lookup, not just the JS guard
 *
 * Cache is mocked — invalidation behavior is covered separately in the
 * e2e suite, which exercises the full Redis interaction.
 */
import { NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { DataSource, Repository } from 'typeorm';
import { Movie } from '../../src/movies/movie.entity';
import { Rating } from '../../src/ratings/rating.entity';
import { RatingsService } from '../../src/ratings/ratings.service';
import { User } from '../../src/users/user.entity';
import {
  startPostgres,
  PostgresTestContext,
} from '../utils/postgres-container';

describe('RatingsService (integration)', () => {
  let ctx: PostgresTestContext;
  let dataSource: DataSource;
  let movieRepo: Repository<Movie>;
  let ratingRepo: Repository<Rating>;
  let userRepo: Repository<User>;
  let service: RatingsService;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  beforeAll(async () => {
    ctx = await startPostgres();
    dataSource = ctx.dataSource;
    movieRepo = dataSource.getRepository(Movie);
    ratingRepo = dataSource.getRepository(Rating);
    userRepo = dataSource.getRepository(User);
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE user_ratings, movies, users RESTART IDENTITY CASCADE',
    );
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    cache.get.mockResolvedValue(undefined);
    service = new RatingsService(dataSource, cache as unknown as Cache);
  });

  /** Helper: create a user and return its id (bigint as string). */
  async function makeUser(email: string): Promise<string> {
    const user = await userRepo.save({
      email,
      passwordHash: 'x'.repeat(40),
    });
    return user.id;
  }

  /** Helper: create a movie with zero ratings. */
  async function makeMovie(tmdbId: number, title: string): Promise<Movie> {
    return movieRepo.save({
      tmdbId,
      title,
      popularity: 100,
    });
  }

  describe('upsert', () => {
    it('creates a rating and increments counters (sum += value, count += 1)', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      const result = await service.upsert(userId, movie.id, 7);

      expect(result.value).toBe(7);
      expect(result.movie).toEqual({ avgRating: 7, ratingCount: 1 });

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingSum).toBe('7');
      expect(fresh.ratingCount).toBe(1);
    });

    it('updates an existing rating with the correct delta (count unchanged)', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await service.upsert(userId, movie.id, 7);
      const second = await service.upsert(userId, movie.id, 4);

      expect(second.value).toBe(4);
      expect(second.movie).toEqual({ avgRating: 4, ratingCount: 1 });

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingSum).toBe('4');
      expect(fresh.ratingCount).toBe(1);

      // Exactly one row per (user, movie) — UNIQUE constraint enforces.
      const rows = await ratingRepo.find({ where: { userId, movieId: movie.id } });
      expect(rows).toHaveLength(1);
    });

    it('bumps the movies cache version on success', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await service.upsert(userId, movie.id, 7);

      expect(cache.del).toHaveBeenCalledWith(`movies:detail:${movie.id}`);
      expect(cache.set).toHaveBeenCalledWith(
        'movies:rating-version',
        expect.any(String),
        expect.any(Number),
      );
    });

    it('throws 404 if the movie does not exist', async () => {
      const userId = await makeUser('alice@test.com');

      await expect(service.upsert(userId, '999999', 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes the rating and decrements counters', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');
      await service.upsert(userId, movie.id, 8);

      await service.remove(userId, movie.id);

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingSum).toBe('0');
      expect(fresh.ratingCount).toBe(0);
      const rows = await ratingRepo.find({ where: { userId, movieId: movie.id } });
      expect(rows).toHaveLength(0);
    });

    it('throws 404 if the caller has not rated this movie', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await expect(service.remove(userId, movie.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 if the movie does not exist', async () => {
      const userId = await makeUser('alice@test.com');

      await expect(service.remove(userId, '999999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('findMine', () => {
    it('returns the caller’s rating', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');
      await service.upsert(userId, movie.id, 9);

      const mine = await service.findMine(userId, movie.id);
      expect(mine.value).toBe(9);
      expect(mine.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('throws 404 when the caller has not rated', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await expect(service.findMine(userId, movie.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('does not leak another user’s rating', async () => {
      const aliceId = await makeUser('alice@test.com');
      const bobId = await makeUser('bob@test.com');
      const movie = await makeMovie(1, 'Test Movie');
      await service.upsert(aliceId, movie.id, 9);

      await expect(service.findMine(bobId, movie.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('concurrent writes — the race tests', () => {
    it('two same-user PUTs produce exactly one row and rating_count = 1', async () => {
      // The race: two concurrent transactions, same (user, movie), each
      // believes there is no existing rating yet. Without the FOR UPDATE
      // lock on the movies row, both would compute deltaCount = +1 and
      // both increment the counter → drift. With the lock, the second
      // transaction sees the first's post-commit state.
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await Promise.all([
        service.upsert(userId, movie.id, 7),
        service.upsert(userId, movie.id, 4),
      ]);

      const rows = await ratingRepo.find({ where: { userId, movieId: movie.id } });
      expect(rows).toHaveLength(1);

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingCount).toBe(1);
      // The value is whichever PUT committed last; sum = that value.
      expect(['7', '4']).toContain(fresh.ratingSum);
      expect([7, 4]).toContain(rows[0].value);
      // And the canonical invariant: sum == rows[0].value.
      expect(fresh.ratingSum).toBe(String(rows[0].value));
    });

    it('two different-user PUTs both apply (count = 2, sum = a + b)', async () => {
      const aliceId = await makeUser('alice@test.com');
      const bobId = await makeUser('bob@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await Promise.all([
        service.upsert(aliceId, movie.id, 7),
        service.upsert(bobId, movie.id, 4),
      ]);

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingCount).toBe(2);
      expect(fresh.ratingSum).toBe('11');
    });

    it('PUT then DELETE in quick succession leaves counters at zero', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Test Movie');

      await service.upsert(userId, movie.id, 6);
      await service.remove(userId, movie.id);

      const fresh = await movieRepo.findOneByOrFail({ id: movie.id });
      expect(fresh.ratingSum).toBe('0');
      expect(fresh.ratingCount).toBe(0);
    });
  });
});
