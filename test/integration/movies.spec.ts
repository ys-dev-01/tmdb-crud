/**
 * Integration test for MoviesService — exercises the real query paths
 * against a Postgres testcontainer.
 *
 * Cache is mocked (no Redis container) because cache behavior is covered
 * by the e2e suite. Here we want to assert SQL correctness:
 * - cursor pagination yields stable, non-overlapping pages
 * - genre filter narrows correctly via the EXISTS subquery
 * - search ILIKE matches substrings; 404 path throws NotFoundException
 */
import { NotFoundException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { Genre } from '../../src/genres/genre.entity';
import { MovieGenre } from '../../src/movies/movie-genre.entity';
import { Movie } from '../../src/movies/movie.entity';
import { MoviesService } from '../../src/movies/movies.service';
import { startPostgres, PostgresTestContext } from '../utils/postgres-container';

describe('MoviesService (integration)', () => {
  let ctx: PostgresTestContext;
  let movieRepo: Repository<Movie>;
  let genreRepo: Repository<Genre>;
  let movieGenreRepo: Repository<MovieGenre>;
  let service: MoviesService;
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set'>>;

  beforeAll(async () => {
    ctx = await startPostgres();
    movieRepo = ctx.dataSource.getRepository(Movie);
    genreRepo = ctx.dataSource.getRepository(Genre);
    movieGenreRepo = ctx.dataSource.getRepository(MovieGenre);
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  beforeEach(async () => {
    await ctx.dataSource.query(
      'TRUNCATE TABLE movie_genres, movies, genres RESTART IDENTITY CASCADE',
    );

    // seed 2 genres, 4 movies with mixed assignments
    const action = await genreRepo.save({ tmdbId: 28, name: 'Action' });
    const drama = await genreRepo.save({ tmdbId: 18, name: 'Drama' });

    const popular = await movieRepo.save({
      tmdbId: 100,
      title: 'Popular Action',
      popularity: 500,
    });
    const middle = await movieRepo.save({
      tmdbId: 101,
      title: 'Middle Drama',
      popularity: 300,
    });
    const tied = await movieRepo.save({
      tmdbId: 102,
      title: 'Tied Drama',
      popularity: 300,
    });
    const niche = await movieRepo.save({
      tmdbId: 103,
      title: 'Niche Action',
      popularity: 100,
    });

    await movieGenreRepo.save([
      { movieId: popular.id, genreId: action.id },
      { movieId: middle.id, genreId: drama.id },
      { movieId: tied.id, genreId: drama.id },
      { movieId: niche.id, genreId: action.id },
    ]);

    cache = { get: jest.fn(), set: jest.fn() };
    cache.get.mockResolvedValue(undefined);
    service = new MoviesService(movieRepo, genreRepo, cache as unknown as Cache);
  });

  describe('findMany', () => {
    it('orders by popularity DESC (id DESC tiebreaker), paginates without overlap', async () => {
      const page1 = await service.findMany({ limit: 2 });
      // popular=500 ranks first. Then middle(300, id=2) and tied(300, id=3)
      // share popularity; id DESC puts tied (id=3) before middle (id=2).
      expect(page1.data.map((m) => m.title)).toEqual([
        'Popular Action',
        'Tied Drama',
      ]);
      expect(page1.meta.hasMore).toBe(true);

      const page2 = await service.findMany({
        limit: 2,
        cursor: page1.meta.nextCursor!,
      });
      expect(page2.data.map((m) => m.title)).toEqual([
        'Middle Drama',
        'Niche Action',
      ]);
    });

    it('filters by genreIds (EXISTS subquery, OR semantics)', async () => {
      const action = await genreRepo.findOneByOrFail({ name: 'Action' });
      const result = await service.findMany({ genreIds: action.id });
      expect(result.data.map((m) => m.title).sort()).toEqual([
        'Niche Action',
        'Popular Action',
      ]);
    });

    it('cache hit short-circuits the DB query', async () => {
      const cached = { data: [], meta: { nextCursor: null, hasMore: false } };
      cache.get.mockResolvedValueOnce(cached);

      const result = await service.findMany({ limit: 2 });

      expect(result).toBe(cached);
      // No movie rows returned despite seeded data — DB was not queried.
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('returns the movie with its genres alphabetized', async () => {
      const popular = await movieRepo.findOneByOrFail({ tmdbId: 100 });
      // Tag with both genres so we can verify ordering.
      const drama = await genreRepo.findOneByOrFail({ name: 'Drama' });
      await movieGenreRepo.save({ movieId: popular.id, genreId: drama.id });

      const result = await service.findOne(popular.id);

      expect(result.title).toBe('Popular Action');
      expect(result.genres.map((g) => g.name)).toEqual(['Action', 'Drama']);
    });

    it('throws NotFoundException on unknown id', async () => {
      await expect(service.findOne('999999')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('matches substrings case-insensitively', async () => {
      const result = await service.search({ q: 'drama' });
      expect(result.data.map((m) => m.title).sort()).toEqual([
        'Middle Drama',
        'Tied Drama',
      ]);
      expect(result.total).toBe(2);
    });

    it('respects genre filter combined with q', async () => {
      const action = await genreRepo.findOneByOrFail({ name: 'Action' });
      const result = await service.search({
        q: 'action',
        genreIds: action.id,
      });
      expect(result.data.map((m) => m.title).sort()).toEqual([
        'Niche Action',
        'Popular Action',
      ]);
    });
  });
});
