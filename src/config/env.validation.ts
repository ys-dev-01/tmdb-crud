import * as Joi from 'joi';
import { MOVIES_SYNC_DEFAULT_MAX_PAGES } from '../movies/movies.constants';
import {
  TMDB_DISCOVER_PAGE_MAX,
  TMDB_DISCOVER_PAGE_MIN,
} from '../tmdb/tmdb.constants';

/**
 * Validates the process env at app boot. Crash loudly on missing/invalid vars.
 * Each PR appends the env it needs; this file is the single contract for the app's environment.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(8080),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  // TMDB
  // v3 API key is 32 hex chars; reject malformed values at boot rather than at first request.
  TMDB_API_KEY: Joi.string()
    .length(32)
    .pattern(/^[a-f0-9]+$/)
    .required(),
  TMDB_BASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .default('https://api.themoviedb.org/3'),
  // How many pages to pull from /discover/movie. Bounded by TMDB's page cap.
  MOVIES_SYNC_MAX_PAGES: Joi.number()
    .integer()
    .min(TMDB_DISCOVER_PAGE_MIN)
    .max(TMDB_DISCOVER_PAGE_MAX)
    .default(MOVIES_SYNC_DEFAULT_MAX_PAGES),

  // Auth — HMAC-SHA256 JWT secret. >= 32 bytes random; generate with
  // `openssl rand -hex 32`. Treat like a DB password — leak it and every
  // existing token can be forged.
  JWT_SECRET: Joi.string().min(32).required(),
  // Accepted formats: jsonwebtoken's expiresIn (e.g., '15m', '1h', '7d').
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),

  // Redis (cache-aside via CacheModule + @keyv/redis)
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),

  // CORS allowlist — comma-separated list of allowed origins
  // (e.g., 'https://app.example.com,https://admin.example.com').
  // Unset/empty means CORS is disabled (deny-all on cross-origin
  // requests), the safe default for an API. The frontend needs this
  // set in prod to permit browser calls.
  CORS_ORIGIN: Joi.string().allow('').optional(),
});
