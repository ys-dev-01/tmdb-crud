/**
 * Ephemeral Postgres for integration + e2e tests.
 *
 * Spawns a fresh `postgres:17-alpine` (matching the prod image) per suite via
 * testcontainers, runs the real migrations against it, and returns a TypeORM
 * DataSource pointed at the running container.
 *
 * Why a fresh DataSource (not reusing AppDataSource):
 * - AppDataSource reads process.env at module load, so reconfiguring it
 *   post-import is brittle.
 * - A fresh DataSource keeps the integration suite hermetic — no leakage
 *   between unit tests (which never touch env-driven config) and integration
 *   tests (which need container-driven host/port).
 *
 * Why the real migrations (not synchronize: true):
 * - Migrations are part of the system under test. Running them here means a
 *   broken migration fails the suite at setup, not in prod.
 */
import * as path from 'path';
import { DataSource } from 'typeorm';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export interface PostgresTestContext {
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
  stop(): Promise<void>;
}

export async function startPostgres(): Promise<PostgresTestContext> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();

  const dataSource = new DataSource({
    type: 'postgres',
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities: [path.join(PROJECT_ROOT, 'src', '**', '*.entity.{ts,js}')],
    migrations: [
      path.join(PROJECT_ROOT, 'src', 'database', 'migrations', '*.{ts,js}'),
    ],
    synchronize: false,
  });

  await dataSource.initialize();
  await dataSource.runMigrations();

  return {
    container,
    dataSource,
    async stop() {
      if (dataSource.isInitialized) await dataSource.destroy();
      await container.stop();
    },
  };
}
