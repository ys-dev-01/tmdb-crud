/**
 * End-to-end tests for the /favorites endpoints. Mirror of the
 * watchlist suite — same harness, same assertions, different table.
 * Plus one cross-feature check: a movie in both /favorites and
 * /watchlist round-trips cleanly through the HTTP layer.
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

describe('Favorites (e2e)', () => {
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
                id: 8001,
                title: 'Favorite Movie A',
                overview: 'first',
                release_date: '2024-01-01',
                poster_path: null,
                original_language: 'en',
                popularity: 100,
                genre_ids: [28],
              },
              {
                id: 8002,
                title: 'Favorite Movie B',
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
        email: 'alice-favs@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    aliceToken = (alice.body as TokensResponse).accessToken;

    const bob = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'bob-favs@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    bobToken = (bob.body as TokensResponse).accessToken;

    const list = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const data = (list.body as { data: { id: string; title: string }[] }).data;
    movieAId = data.find((m) => m.title === 'Favorite Movie A')!.id;
    movieBId = data.find((m) => m.title === 'Favorite Movie B')!.id;
  });

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await postgresCtx?.stop();
  });

  it('POST /favorites/:movieId adds and returns the entry', async () => {
    const res = await request(app.getHttpServer())
      .post(`/favorites/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const body = res.body as { id: string; title: string; addedAt: string };
    expect(body.id).toBe(movieAId);
    expect(body.title).toBe('Favorite Movie A');
  });

  it('Second POST returns the same entry without duplicating', async () => {
    const first = await request(app.getHttpServer())
      .post(`/favorites/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post(`/favorites/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    expect((second.body as { addedAt: string }).addedAt).toBe(
      (first.body as { addedAt: string }).addedAt,
    );

    const list = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect((list.body as { data: unknown[] }).data).toHaveLength(1);
  });

  it('GET /favorites returns most-recent first', async () => {
    await request(app.getHttpServer())
      .post(`/favorites/${movieBId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    const titles = (res.body as { data: { title: string }[] }).data.map(
      (i) => i.title,
    );
    expect(titles).toEqual(['Favorite Movie B', 'Favorite Movie A']);
  });

  it('GET /favorites is strictly user-scoped', async () => {
    const bobList = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(200);
    expect((bobList.body as { data: unknown[] }).data).toEqual([]);
  });

  it('DELETE /favorites/:movieId returns 204; second DELETE also 204', async () => {
    await request(app.getHttpServer())
      .delete(`/favorites/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/favorites/${movieAId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);
  });

  it('POST on an unknown movie returns 404', async () => {
    await request(app.getHttpServer())
      .post('/favorites/999999')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);
  });

  it('A movie in /favorites and /watchlist round-trips through both', async () => {
    // Movie B is already in Alice's favorites from the prior test. Add it
    // to her watchlist too — the two lists must stay independent.
    await request(app.getHttpServer())
      .post(`/watchlist/${movieBId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(201);

    const favs = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(
      (favs.body as { data: { id: string }[] }).data.map((i) => i.id),
    ).toContain(movieBId);

    const watch = await request(app.getHttpServer())
      .get('/watchlist')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(
      (watch.body as { data: { id: string }[] }).data.map((i) => i.id),
    ).toContain(movieBId);

    // Remove from watchlist only — favorites entry must remain.
    await request(app.getHttpServer())
      .delete(`/watchlist/${movieBId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(204);

    const favsAfter = await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(
      (favsAfter.body as { data: { id: string }[] }).data.map((i) => i.id),
    ).toContain(movieBId);
  });

  it('All routes require auth', async () => {
    await request(app.getHttpServer())
      .post(`/favorites/${movieAId}`)
      .expect(401);
    await request(app.getHttpServer())
      .delete(`/favorites/${movieAId}`)
      .expect(401);
    await request(app.getHttpServer()).get('/favorites').expect(401);
  });
});
