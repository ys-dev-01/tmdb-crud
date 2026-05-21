/**
 * End-to-end test for the auth + genres flow.
 *
 * Boots the real AppModule against ephemeral Postgres + Redis containers,
 * mirrors the global ValidationPipe from main.ts, and drives HTTP via
 * supertest. The only seam is TmdbClient — overridden to return a fixed
 * pair of genres so the test doesn't depend on TMDB being reachable.
 *
 * Why full app boot (not just controllers): this is where the guard, the
 * passport JWT strategy, the global validation pipe, the JWT-issuing
 * AuthService, and the cache-backed GenresService all come together. If
 * any of them is misconfigured (wrong APP_GUARD provider, missing JWT
 * module wiring, etc.), only the bootstrap path catches it.
 *
 * The mocked TmdbClient lets us assert that the OnApplicationBootstrap
 * sync ran and populated the genres table during app.init().
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

import { startPostgres, PostgresTestContext } from './utils/postgres-container';

interface TokensResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

describe('Auth + Genres (e2e)', () => {
  let postgresCtx: PostgresTestContext;
  let redisContainer: StartedRedisContainer;
  let app: INestApplication;

  beforeAll(async () => {
    postgresCtx = await startPostgres();
    redisContainer = await new RedisContainer('redis:7-alpine').start();

    // Set env BEFORE importing AppModule — ConfigService snapshots
    // process.env when the module is constructed.
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

    // Dynamic require AFTER env is set — AppModule's imports evaluate
    // ConfigModule.forRoot at import time, which validates env via Joi.
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
        // MoviesSyncService runs at bootstrap; return an empty page so the
        // e2e doesn't try to seed real movies (this suite tests auth +
        // genres only).
        fetchDiscoverMovies: () =>
          Promise.resolve({
            page: 1,
            results: [],
            total_pages: 0,
            total_results: 0,
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
  });

  afterAll(async () => {
    await app?.close();
    await redisContainer?.stop();
    await postgresCtx?.stop();
  });

  beforeEach(async () => {
    // Genres are populated by OnApplicationBootstrap sync; leave them alone.
    // Users + tokens are per-test fixtures.
    await postgresCtx.dataSource.query(
      'TRUNCATE TABLE refresh_tokens, users RESTART IDENTITY CASCADE',
    );
  });

  it('GET /genres without an Authorization header returns 401', async () => {
    await request(app.getHttpServer()).get('/genres').expect(401);
  });

  it('register → use access token → /genres returns the synced rows', async () => {
    const email = 'e2e@test.com';
    const password = 'correct horse battery staple';

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    const tokens = registerRes.body as TokensResponse;
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toMatch(/^[0-9a-f]{64}$/);

    const genresRes = await request(app.getHttpServer())
      .get('/genres')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    const names = (genresRes.body as { name: string }[])
      .map((g) => g.name)
      .sort();
    expect(names).toEqual(['Action', 'Drama']);
  });

  it('GET /auth/me returns the current user (CurrentUser decorator path)', async () => {
    const email = 'me@test.com';
    const password = 'correct horse battery staple';

    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const tokens = reg.body as TokensResponse;

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);

    expect((me.body as { email: string }).email).toBe(email);
  });

  it('refresh rotation: new pair issued, old refresh rejected on replay', async () => {
    const email = 'refresh@test.com';
    const password = 'correct horse battery staple';

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const original = registerRes.body as TokensResponse;

    const rotateRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(200);
    const rotated = rotateRes.body as TokensResponse;

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    expect(rotated.accessToken).toBeTruthy();

    // Replay the original (revoked) refresh token — must be rejected.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(401);

    // The new refresh token still works.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(200);
  });
});
