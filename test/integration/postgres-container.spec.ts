/**
 * Smoke test for the testcontainers helper itself.
 *
 * Asserts that startPostgres() actually boots Postgres, runs all migrations,
 * and exposes a usable DataSource. If this fails, every other integration
 * test in this suite would fail for the same reason — this isolates the
 * infrastructure failure mode.
 */
import {
  startPostgres,
  PostgresTestContext,
} from '../utils/postgres-container';

const EXPECTED_TABLES = [
  'users',
  'refresh_tokens',
  'genres',
  'movies',
  'movie_genres',
  'user_ratings',
  'watchlist',
  'favorites',
];

describe('postgres-container helper', () => {
  let ctx: PostgresTestContext;

  beforeAll(async () => {
    ctx = await startPostgres();
  });

  afterAll(async () => {
    await ctx?.stop();
  });

  it('boots Postgres and exposes an initialized DataSource', () => {
    expect(ctx.dataSource.isInitialized).toBe(true);
  });

  it('runs migrations: all 8 schema tables exist', async () => {
    const rows = await ctx.dataSource.query<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = rows.map((r) => r.tablename);
    for (const t of EXPECTED_TABLES) {
      expect(names).toContain(t);
    }
  });
});
