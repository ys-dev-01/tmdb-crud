/**
 * End-to-end test for the /movies endpoints.
 *
 * Same harness pattern as auth-genres.e2e-spec.ts: real Postgres + Redis
 * containers, TmdbClient overridden so the bootstrap sync can be
 * deterministic. The override returns a small canned movie set so the
 * sync populates the schema and tests can drive the read endpoints.
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

describe('Movies (e2e)', () => {
  let postgresCtx: PostgresTestContext;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;
  let token: string;

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
            genres: [
              { id: 28, name: 'Action' },
              { id: 18, name: 'Drama' },
            ],
          }),
        fetchDiscoverMovies: () =>
          Promise.resolve({
            page: 1,
            total_pages: 1,
            total_results: 3,
            results: [
              {
                id: 1001,
                title: 'Star Voyager',
                overview: 'Outer-space adventure.',
                release_date: '2024-01-01',
                poster_path: null,
                original_language: 'en',
                popularity: 500,
                genre_ids: [28],
              },
              {
                id: 1002,
                title: 'Quiet Drama',
                overview: 'Small-town life.',
                release_date: '2024-02-01',
                poster_path: null,
                original_language: 'en',
                popularity: 200,
                genre_ids: [18],
              },
              {
                id: 1003,
                title: 'Star Crossed',
                overview: 'Two genres.',
                release_date: '2024-03-01',
                poster_path: null,
                original_language: 'en',
                popularity: 350,
                genre_ids: [28, 18],
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

    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'movies-e2e@test.com',
        password: 'correct horse battery staple',
      })
      .expect(201);
    token = (reg.body as TokensResponse).accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await postgresCtx?.stop();
  });

  it('GET /movies returns rows sorted by popularity DESC', async () => {
    const res = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: { title: string; popularity: number }[];
      meta: { hasMore: boolean };
    };
    expect(body.data.map((m) => m.title)).toEqual([
      'Star Voyager',
      'Star Crossed',
      'Quiet Drama',
    ]);
    expect(body.meta.hasMore).toBe(false);
  });

  it('GET /movies/:id returns embedded genres alphabetized', async () => {
    const list = await request(app.getHttpServer())
      .get('/movies?limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const crossed = (
      list.body as { data: { id: string; title: string }[] }
    ).data.find((m) => m.title === 'Star Crossed')!;

    const res = await request(app.getHttpServer())
      .get(`/movies/${crossed.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const body = res.body as { genres: { name: string }[] };
    expect(body.genres.map((g) => g.name)).toEqual(['Action', 'Drama']);
  });

  it('GET /movies/search?q=star matches both Star titles, popularity-ordered', async () => {
    const res = await request(app.getHttpServer())
      .get('/movies/search?q=star')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as { data: { title: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.data.map((m) => m.title)).toEqual([
      'Star Voyager',
      'Star Crossed',
    ]);
  });

  it('GET /movies/search?q=a is rejected (below MIN_QUERY_LENGTH)', async () => {
    await request(app.getHttpServer())
      .get('/movies/search?q=a')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('GET /movies/999999 returns 404', async () => {
    await request(app.getHttpServer())
      .get('/movies/999999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
