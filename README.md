# TMDB CRUD API

NestJS service backed by PostgreSQL.

## Prerequisites

- Docker with the Compose v2 plugin (`docker compose`)

## Quick start

```bash
cp .env.example .env
docker compose up
```

Before starting, you need two secrets in `.env`:

- `TMDB_API_KEY` — TMDB v3 API key (free): sign up at <https://www.themoviedb.org/settings/api>.
- `JWT_SECRET` — at least 32 random bytes. Generate one with `openssl rand -hex 32`.

Then:

- App: <http://localhost:8080>
- Swagger UI: <http://localhost:8080/api>
- Health check: <http://localhost:8080/health>
- Genres: <http://localhost:8080/genres> *(requires `Authorization: Bearer <accessToken>`)*

To stop and remove volumes:

```bash
docker compose down -v
```

## Environment

All env vars the app reads are documented in `.env.example`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `8080` | App listen port |
| `DB_HOST` | yes | — | Postgres host (`postgres` inside compose) |
| `DB_PORT` | no | `5432` | Postgres port |
| `DB_USER` | yes | — | Postgres user |
| `DB_PASSWORD` | yes | — | Postgres password |
| `DB_NAME` | yes | — | Postgres database name |
| `TMDB_API_KEY` | yes | — | TMDB v3 API key (32 hex chars) — get one at <https://www.themoviedb.org/settings/api> |
| `TMDB_BASE_URL` | no | `https://api.themoviedb.org/3` | TMDB API base; overridable for testing |
| `JWT_SECRET` | yes | — | HS256 signing secret, >= 32 bytes random. `openssl rand -hex 32` |
| `JWT_ACCESS_TTL` | no | `15m` | Access token lifetime ([`ms`](https://www.npmjs.com/package/ms) format) |
| `JWT_REFRESH_TTL` | no | `7d` | Refresh token lifetime |
| `REDIS_HOST` | yes | — | Redis host (`redis` inside compose) |
| `REDIS_PORT` | no | `6379` | Redis port |

Env is validated at startup via Joi; the app exits if anything is missing or invalid.

## Project structure

```
src/
├── auth/          # /auth/* endpoints, JWT strategy, refresh-token service, hashing
├── common/        # @Public, @CurrentUser decorators, JwtAuthGuard
├── config/        # Joi env validation schema
├── database/      # TypeORM connection + migrations
├── genres/        # /genres endpoint + TMDB sync
├── health/        # /health endpoint
├── tmdb/          # TmdbClient (axios + retry)
├── users/         # User entity + UsersService
├── movies/        # Movie + MovieGenre entities
├── ratings/       # Rating entity
├── watchlist/     # WatchlistEntry entity
├── favorites/     # FavoriteEntry entity
├── app.module.ts
└── main.ts
```

Entities for unimplemented features (movies, ratings, watchlist, favorites) live alongside the modules they will belong to; the schema was designed upfront in [`docs/schema.md`](docs/schema.md).

## Endpoints

Every route requires `Authorization: Bearer <accessToken>` unless marked public.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | public | App + Postgres reachability check |
| POST | `/auth/register` | public | Create account; returns access + refresh tokens |
| POST | `/auth/login` | public | Verify creds; returns access + refresh tokens |
| POST | `/auth/refresh` | public | Rotate refresh token; returns a fresh pair |
| POST | `/auth/logout` | public | Revoke a refresh token (idempotent) |
| GET | `/auth/me` | required | Current user's profile |
| GET | `/genres` | required | List all genres (synced from TMDB at boot) |
| GET | `/api` | public | Swagger UI |
| GET | `/api-json` | public | OpenAPI spec |

## Auth

- **Access tokens** are signed JWTs (HS256), default lifetime 15 minutes. Send as `Authorization: Bearer <token>`.
- **Refresh tokens** are opaque random strings (256 bits), default lifetime 7 days. Stored as sha256 hashes — the DB cannot replay them on its own. **Single-use**: every successful `/auth/refresh` issues a new token and revokes the old; presenting a revoked token returns 401.
- **Logout** revokes a refresh token; the access token continues to work until natural expiry (statelessness is the tradeoff for stateless JWTs).
- **Identity** is sourced exclusively from the JWT's `sub` claim via `@CurrentUser()` — request bodies, URL params, and query strings are never trusted for user identity.
- Passwords hashed with **Argon2id** at OWASP 2026 parameters (m=65536 KiB, t=3, p=1).
- Login returns the same error for "user not found" and "wrong password" to prevent email enumeration.

### Example flow

```bash
# Register
curl -X POST http://localhost:8080/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"correct horse battery staple"}'

# Capture the accessToken from the response, then call protected routes:
curl http://localhost:8080/genres \
  -H "Authorization: Bearer <accessToken>"
```

## Database

Schema is managed by TypeORM migrations under `src/database/migrations/`. The current state is documented in [`docs/schema.md`](docs/schema.md) with an ER diagram and per-table notes.

To apply migrations against the running database:

```bash
docker compose exec app npm run migration:run
```

To create a new migration after editing entities:

```bash
docker compose exec app npm run migration:generate -- src/database/migrations/<Name>
```

## Caching

The app uses **cache-aside** against Redis for read paths that benefit from it.

Stack: `@nestjs/cache-manager` (NestJS wrapper) + `cache-manager` v7 + `@keyv/redis` via Keyv. `CacheModule` is registered globally; feature services inject `Cache` via `CACHE_MANAGER`.

| Path | Key | TTL | Notes |
|---|---|---|---|
| `GET /genres` | `genres:list` | 24h | TMDB genre list changes maybe yearly; aggressive TTL is safe. |

Redis runs as a separate compose service:

- `redis:7-alpine` image
- `maxmemory 256mb` + `maxmemory-policy allkeys-lru` — bounded memory; under pressure Redis evicts the least-recently-used keys. Cache is a performance layer, never a system of record.
- Not exposed to the host; reachable only inside the compose network (like Postgres).

To inspect what's cached:

```bash
docker compose exec redis redis-cli KEYS '*'
docker compose exec redis redis-cli TTL '<key>'
docker compose exec redis redis-cli GET '<key>'
```

Note: `@keyv/redis` prefixes keys with `keyv::keyv:` — the genres list lives at `keyv::keyv:genres:list`.

## Tests

```bash
npm test
```
