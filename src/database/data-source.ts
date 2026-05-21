/**
 * Standalone TypeORM DataSource used by the migration CLI.
 *
 * The NestJS app reads DB config via ConfigService (see database.module.ts).
 * The TypeORM CLI runs outside the Nest DI container, so it reads process.env directly.
 * Both must agree on the connection params — they're declared twice on purpose.
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as path from 'path';

// Single named export only — TypeORM CLI's migration:generate refuses files with
// multiple DataSource exports (rejects even an additional `export default`).
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Entities are discovered by globbing — works for both .ts (CLI via ts-node) and .js (runtime).
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
