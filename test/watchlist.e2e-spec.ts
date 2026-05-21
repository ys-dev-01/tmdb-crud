/**
 * End-to-end tests for the /watchlist endpoints.
 *
 * Real Postgres + Redis containers. TmdbClient is stubbed so the
 * bootstrap sync seeds a small known catalog deterministically.
 *
 * Coverage goals:
 *   - POST happy path + idempotent re-add
 *   - DELETE happy path + idempotent re-delete (both return 204)
 *   - GET returns most-recent first
 *   - Cross-user isolation: Alice's writes invisible to Bob's GET
 *   - 404 on POST against an unknown movie id
 *   - Cache invalidation through real Redis: GET after POST reflects
 *     the new entry (per-user version-bump worked end-to-end)
 *   - All routes return 401 without a token
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

describe('Watchlist (e2e)', () => {
  let postgresCtx: PostgresTestContext;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let aliceToken: string;
  let bobToken: string;
  let movieAId: string;
  let movieBId: string;

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
            total_results: 2,
            results: [
              {
                id: 7001,
                title: 'Watchlist Movie A',
                overview: 'first',
                release_date: '2024-01-01',
                poster_path: null,
                original_language: 'en',
                popularity: 100,
                genre_ids: [28],
              },
              {
                id: 7002,
                title: 'Watchlist Movie B',
                overview: 'second',
                release_date: '2024-01-02',
                poster_path: null,
                original_language: 'en',
                popularity: 90,
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
        email: 'alice-watchlist@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    aliceToken = (alice.body as TokensResponse).accessToken;

    const bob = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bob-watchlist@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    bobToken = (bob.body as TokensResponse).accessToken;

    const list = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const data = (list.body as { data: { id: string; title: string }[] }).data;
    movieAId = data.find((m) => m.title === 'Watchlist Movie A')!.id;
    movieBId = data.find((m) => m.title === 'Watchlist Movie B')!.id;
  });

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await postgresCtx?.stop();
  });

  it('POST /watchlist/:movieId adds and returns the entry', async () => {
    const res = await request(app.getHttpServer())
      .post(`/watchlist/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const body = res.body as { id: string; title: string; addedAt: string };
    expect(body.id).toBe(movieAId);
    expect(body.title).toBe('Watchlist Movie A');
    expect(body.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('Second POST returns the same entry without duplicating', async () => {
    const first = await request(app.getHttpServer())
      .post(`/watchlist/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/watchlist/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    expect((second.body as { addedAt: string }).addedAt).toBe(
      (first.body as { addedAt: string }).addedAt,
    );

    const list = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('GET /watchlist returns most-recent first; cache reflects writes', async () => {
    // Add B after A; B should appear first.
    await request(app.getHttpServer())
      .post(`/watchlist/${movieBId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const titles = (res.body as { data: { title: string }[] }).data.map(
      (i) => i.title,
    );
    expect(titles).toEqual(['Watchlist Movie B', 'Watchlist Movie A']);
  });

  it('GET /watchlist is strictly user-scoped', async () => {
    const aliceList = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((aliceList.body as { data: unknown[] }).data).toHaveLength(2);

    const bobList = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect((bobList.body as { data: unknown[] }).data).toEqual([]);
  });

  it('DELETE /watchlist/:movieId returns 204 and removes the entry', async () => {
    await request(app.getHttpServer())
      .delete(`/watchlist/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    const list = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const titles = (list.body as { data: { title: string }[] }).data.map(
      (i) => i.title,
    );
    expect(titles).toEqual(['Watchlist Movie B']);
  });

  it('DELETE again still returns 204 (idempotent)', async () => {
    await request(app.getHttpServer())
      .delete(`/watchlist/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);
  });

  it('POST on an unknown movie returns 404', async () => {
    await request(app.getHttpServer())
      .post('/watchlist/999999')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({})
      .expect(404);
  });

  it('All routes require auth', async () => {
    await request(app.getHttpServer())
      .post(`/watchlist/${movieAId}`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/watchlist/${movieAId}`)
      .expect(401);
    await request(app.getHttpServer()).get('/watchlist').expect(401);
  });
});
