/**
 * Integration tests for FavoritesService against a real Postgres
 * testcontainer.
 *
 * Properties under test mirror the watchlist suite (same pattern):
 *   - POST idempotent (ON CONFLICT DO NOTHING)
 *   - DELETE idempotent at the set level
 *   - GET strictly user-scoped, most-recent first
 *   - Cursor pagination stable across pages
 *   - Cache hit short-circuits the DB
 *
 * Plus one unique to PR #10: favorites and watchlist live in
 * independent tables, so the same (user, movie) can be in both
 * without interference.
 */
import type { Cache } from 'cache-manager';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Movie } from '../../src/movies/movie.entity';
import { User } from '../../src/users/user.entity';
import { FavoriteEntry } from '../../src/favorites/favorite.entity';
import { FavoritesService } from '../../src/favorites/favorites.service';
import { WatchlistEntry } from '../../src/watchlist/watchlist.entity';
import {
  startPostgres,
  PostgresTestContext,
} from '../utils/postgres-container';

describe('FavoritesService (integration)', () => {
  let ctx: PostgresTestContext;
  let dataSource: DataSource;
  let movieRepo: Repository<Movie>;
  let userRepo: Repository<User>;
  let favoritesRepo: Repository<FavoriteEntry>;
  let watchlistRepo: Repository<WatchlistEntry>;
  let service: FavoritesService;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  beforeAll(async () => {
    ctx = await startPostgres();
    dataSource = ctx.dataSource;
    movieRepo = dataSource.getRepository(Movie);
    userRepo = dataSource.getRepository(User);
    favoritesRepo = dataSource.getRepository(FavoriteEntry);
    watchlistRepo = dataSource.getRepository(WatchlistEntry);
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE favorites, watchlist, movies, users RESTART IDENTITY CASCADE',
    );
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
    cache.get.mockResolvedValue(undefined);
    service = new FavoritesService(
      favoritesRepo,
      movieRepo,
      cache as unknown as Cache,
    );
  });

  async function makeUser(email: string): Promise<string> {
    const user = await userRepo.save({
      email,
      passwordHash: 'x'.repeat(40),
    });
    return user.id;
  }

  async function makeMovie(tmdbId: number, title: string): Promise<Movie> {
    return movieRepo.save({ tmdbId, title, popularity: 100 });
  }

  describe('add', () => {
    it('inserts a new entry and returns the favorite item', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');

      const result = await service.add(userId, movie.id);
      expect(result.id).toBe(movie.id);
      expect(result.title).toBe('Beloved Movie');

      const rows = await favoritesRepo.find({ where: { userId } });
      expect(rows).toHaveLength(1);
    });

    it('is idempotent — second add preserves addedAt and does not duplicate', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');

      const first = await service.add(userId, movie.id);
      await new Promise((r) => setTimeout(r, 10));
      const second = await service.add(userId, movie.id);

      expect(second.addedAt).toBe(first.addedAt);

      const rows = await favoritesRepo.find({ where: { userId } });
      expect(rows).toHaveLength(1);
    });

    it('throws 404 when the movie does not exist', async () => {
      const userId = await makeUser('alice@test.com');

      await expect(service.add(userId, '999999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bumps the per-user version key on success', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');

      await service.add(userId, movie.id);

      expect(cache.set).toHaveBeenCalledWith(
        `favorites:version:${userId}`,
        expect.any(String),
        expect.any(Number),
      );
    });
  });

  describe('remove', () => {
    it('deletes the entry', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');
      await service.add(userId, movie.id);

      await service.remove(userId, movie.id);

      const rows = await favoritesRepo.find({ where: { userId } });
      expect(rows).toHaveLength(0);
    });

    it('is idempotent — removing a non-existent entry does not throw', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');

      await expect(service.remove(userId, movie.id)).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns the caller’s favorites, most-recent first', async () => {
      const userId = await makeUser('alice@test.com');
      const m1 = await makeMovie(1, 'First');
      const m2 = await makeMovie(2, 'Second');

      await service.add(userId, m1.id);
      await new Promise((r) => setTimeout(r, 10));
      await service.add(userId, m2.id);

      const result = await service.list(userId, {});
      expect(result.data.map((i) => i.title)).toEqual(['Second', 'First']);
    });

    it('strictly scopes by user', async () => {
      const aliceId = await makeUser('alice@test.com');
      const bobId = await makeUser('bob@test.com');
      const m = await makeMovie(1, 'Movie');
      await service.add(aliceId, m.id);

      const bobList = await service.list(bobId, {});
      expect(bobList.data).toEqual([]);
    });

    it('paginates via cursor without overlap', async () => {
      const userId = await makeUser('alice@test.com');
      const movies = await Promise.all(
        [1, 2, 3, 4].map((i) => makeMovie(i, `Movie ${i}`)),
      );
      for (const m of movies) {
        await service.add(userId, m.id);
        await new Promise((r) => setTimeout(r, 5));
      }

      const page1 = await service.list(userId, { limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.meta.hasMore).toBe(true);

      const page2 = await service.list(userId, {
        limit: 2,
        cursor: page1.meta.nextCursor!,
      });

      const allIds = [...page1.data, ...page2.data].map((i) => i.id);
      expect(new Set(allIds).size).toBe(4);
    });

    it('cache hit short-circuits the DB query', async () => {
      const userId = await makeUser('alice@test.com');
      const cached = {
        data: [],
        meta: { nextCursor: null, hasMore: false },
      };
      cache.get.mockResolvedValueOnce('0').mockResolvedValueOnce(cached);

      const result = await service.list(userId, { limit: 10 });
      expect(result).toBe(cached);
    });
  });

  describe('independence from watchlist', () => {
    it('the same (user, movie) can live in both favorites and watchlist', async () => {
      const userId = await makeUser('alice@test.com');
      const movie = await makeMovie(1, 'Beloved Movie');

      await service.add(userId, movie.id);
      await watchlistRepo.save({ userId, movieId: movie.id });

      const favs = await favoritesRepo.find({ where: { userId } });
      const watch = await watchlistRepo.find({ where: { userId } });

      expect(favs).toHaveLength(1);
      expect(watch).toHaveLength(1);
      expect(favs[0].movieId).toBe(watch[0].movieId);

      // Removing from favorites must not touch watchlist (different tables).
      await service.remove(userId, movie.id);

      expect(await favoritesRepo.find({ where: { userId } })).toHaveLength(0);
      expect(await watchlistRepo.find({ where: { userId } })).toHaveLength(1);
    });
  });
});
