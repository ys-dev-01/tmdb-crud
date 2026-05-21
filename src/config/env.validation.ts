import * as Joi from 'joi';

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

  // Auth — HMAC-SHA256 JWT secret. >= 32 bytes random; generate with
  // `openssl rand -hex 32`. Treat like a DB password — leak it and every
  // existing token can be forged.
  JWT_SECRET: Joi.string().min(32).required(),
  // Accepted formats: jsonwebtoken's expiresIn (e.g., '15m', '1h', '7d').
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
});
