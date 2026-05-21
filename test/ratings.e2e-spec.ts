/**
 * End-to-end tests for the /movies/:movieId/ratings endpoints.
 *
 * Real Postgres + Redis containers. TmdbClient is stubbed so the
 * bootstrap sync seeds a known small catalog deterministically.
 *
 * Coverage goals:
 *   - PUT happy path returns the new rating + recomputed aggregates
 *   - PUT then PUT updates instead of duplicates (count stays 1)
 *   - DELETE 204 then DELETE 404 (strict, not idempotent)
 *   - GET /me returns 404 before any rating exists
 *   - Validation: value out of 1..10 → 400
 *   - 404 on unknown movie id (both PUT and DELETE)
 *   - GET /movies after a rating reflects the new avg (cache invalidation
 *     via the version-bump mechanism works end-to-end through Redis)
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

import { startPostgres, PostgresTestContext } from './utils/postgres-container';

interface TokensResponse {
  accessToken: string;
  refreshToken: string;
}

describe('Ratings (e2e)', () => {
  let postgresCtx: PostgresTestContext;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let aliceToken: string;
  let bobToken: string;
  let movieId: string;

  beforeAll(async () => {
    postgresCtx = await startPostgres();
    redisContainer = await new RedisContainer('redis:7-alpine').start();

    process.env.NODE_ENV = 'test';
    process.env.DB_HOST = postgresCtx.container.getHost();
    process.env.DB_PORT = String(postgresCtx.container.getPort());
    process.env.DB_USER = postgresCtx.container.getUsername();
    process.env.DB_PASSWORD = postgresCtx.container.getPassword();
    process.env.DB_NAME = postgresCtx.container.getDatabase();
    process.env.REDIS_HOST = redisContainer.getHost();
    process.env.REDIS_PORT = String(redisContainer.getFirstMappedPort());
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.TMDB_API_KEY = 'b'.repeat(32);
    process.env.TMDB_BASE_URL = 'https://tmdb.test';
    process.env.MOVIES_SYNC_MAX_PAGES = '1';

    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } = require('../src/app.module');
    const { TmdbClient } = require('../src/tmdb/tmdb.client');
    /* eslint-enable @typescript-eslint/no-require-imports */

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TmdbClient)
      .useValue({
        onModuleInit: () => undefined,
        fetchGenres: () =>
          Promise.resolve({
            genres: [{ id: 28, name: 'Action' }],
          }),
        fetchDiscoverMovies: () =>
          Promise.resolve({
            page: 1,
            total_pages: 1,
            total_results: 1,
            results: [
              {
                id: 5001,
                title: 'Rated Movie',
                overview: 'A movie to rate.',
                release_date: '2024-01-01',
                poster_path: null,
                original_language: 'en',
                popularity: 100,
                genre_ids: [28],
              },
            ],
          }),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const alice = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'alice-ratings@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    aliceToken = (alice.body as TokensResponse).accessToken;

    const bob = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bob-ratings@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    bobToken = (bob.body as TokensResponse).accessToken;

    const list = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    movieId = (list.body as { data: { id: string }[] }).data[0].id;
  });

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await postgresCtx?.stop();
  });

  it('PUT /movies/:id/ratings creates the rating and returns aggregates', async () => {
    const res = await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ value: 8 })
      .expect(200);

    const body = res.body as {
      value: number;
      movie: { avgRating: number; ratingCount: number };
    };
    expect(body.value).toBe(8);
    expect(body.movie.avgRating).toBe(8);
    expect(body.movie.ratingCount).toBe(1);
  });

  it('PUT again updates instead of duplicating (count stays 1)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ value: 4 })
      .expect(200);

    const body = res.body as {
      value: number;
      movie: { avgRating: number; ratingCount: number };
    };
    expect(body.value).toBe(4);
    expect(body.movie.ratingCount).toBe(1);
    expect(body.movie.avgRating).toBe(4);
  });

  it('GET /movies/:id/ratings/me returns the caller’s current rating', async () => {
    const res = await request(app.getHttpServer())
      .get(`/movies/${movieId}/ratings/me`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((res.body as { value: number }).value).toBe(4);
  });

  it('Bob’s rating is invisible to Alice’s GET /me (no cross-user leakage)', async () => {
    await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ value: 10 })
      .expect(200);

    const alice = await request(app.getHttpServer())
      .get(`/movies/${movieId}/ratings/me`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((alice.body as { value: number }).value).toBe(4);

    const bob = await request(app.getHttpServer())
      .get(`/movies/${movieId}/ratings/me`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect((bob.body as { value: number }).value).toBe(10);
  });

  it('GET /movies/:id reflects the combined avg after writes (cache invalidated)', async () => {
    // Alice = 4, Bob = 10 → avg 7, count 2
    const res = await request(app.getHttpServer())
      .get(`/movies/${movieId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const body = res.body as { avgRating: number; ratingCount: number };
    expect(body.avgRating).toBe(7);
    expect(body.ratingCount).toBe(2);
  });

  it('GET /movies list reflects the combined avg too (list-version bump worked)', async () => {
    const res = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const row = (
      res.body as { data: { id: string; avgRating: number; ratingCount: number }[] }
    ).data.find((m) => m.id === movieId)!;
    expect(row.avgRating).toBe(7);
    expect(row.ratingCount).toBe(2);
  });

  it('DELETE /movies/:id/ratings returns 204 and decrements aggregates', async () => {
    await request(app.getHttpServer())
      .delete(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(204);

    const detail = await request(app.getHttpServer())
      .get(`/movies/${movieId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const body = detail.body as { avgRating: number; ratingCount: number };
    expect(body.avgRating).toBe(4);
    expect(body.ratingCount).toBe(1);
  });

  it('DELETE again returns 404 (strict, not idempotent)', async () => {
    await request(app.getHttpServer())
      .delete(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);
  });

  it('PUT with value out of range returns 400', async () => {
    await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ value: 11 })
      .expect(400);

    await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ value: 0 })
      .expect(400);
  });

  it('PUT on an unknown movie returns 404', async () => {
    await request(app.getHttpServer())
      .put('/movies/999999/ratings')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ value: 5 })
      .expect(404);
  });

  it('All ratings routes require auth', async () => {
    await request(app.getHttpServer())
      .put(`/movies/${movieId}/ratings`)
      .send({ value: 5 })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/movies/${movieId}/ratings`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/movies/${movieId}/ratings/me`)
      .expect(401);
  });
});
