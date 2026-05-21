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
| `MOVIES_SYNC_MAX_PAGES` | no | `5` | Pages of `/discover/movie` pulled per sync (20 movies/page; TMDB caps at 500) |
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
├── movies/        # /movies + sync + cache
├── ratings/       # /movies/:id/ratings endpoints + counter maintenance
├── watchlist/     # /watchlist endpoints + per-user cache invalidation
├── favorites/     # FavoriteEntry entity
├── app.module.ts
└── main.ts
```

The favorites entity lives alongside the module it will belong to; the full schema was designed upfront in [`docs/schema.md`](docs/schema.md).

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
| GET | `/movies` | required | List movies, cursor-paginated, optional `?genreIds=1,2` filter |
| GET | `/movies/search` | required | Substring search over title (`?q=...`, optional `?genreIds=`) |
| GET | `/movies/:id` | required | Movie detail with embedded genres |
| PUT | `/movies/:id/ratings` | required | Upsert the caller's rating (value 1–10); returns the recomputed movie aggregates |
| DELETE | `/movies/:id/ratings` | required | Remove the caller's rating (404 if not present) |
| GET | `/movies/:id/ratings/me` | required | The caller's rating for the movie, or 404 |
| POST | `/watchlist/:movieId` | required | Idempotently add a movie to the caller's watchlist |
| DELETE | `/watchlist/:movieId` | required | Idempotently remove from the caller's watchlist (204 either way) |
| GET | `/watchlist` | required | Caller's watchlist, cursor-paginated, most-recent first |
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

## Movies

Movies are mirrored from TMDB's `/discover/movie` endpoint. The sync runs on app bootstrap and again every day at 04:00 UTC via `@nestjs/schedule`. Each page is upserted in its own transaction:

1. Bulk `INSERT … ON CONFLICT (tmdb_id) DO UPDATE` on `movies` (skipping `rating_sum` and `rating_count`, which are owned by the ratings write path).
2. Per-batch genre-link reconciliation: `DELETE FROM movie_genres WHERE movie_id IN (...)` then bulk `INSERT` the current set, mapping TMDB `genre_ids` to our internal `genre.id` via an in-memory lookup.

Initial page count is set by `MOVIES_SYNC_MAX_PAGES` (default 5 = ~100 movies, fast first boot). TMDB caps `/discover/movie` at page 500.

### Reads

- **`GET /movies`** — cursor pagination via the [`typeorm-cursor-pagination`](https://github.com/benjamin658/typeorm-cursor-pagination) package. Sorted by popularity DESC with `id` as tiebreaker. Optional `?genreIds=1,2,3` filter (OR semantics, implemented as an `EXISTS` subquery so rows aren't multiplied).
- **`GET /movies/:id`** — single movie with its full `genres` array. Two queries (movie + genres for that movie) rather than a JOIN — avoids row multiplication and keeps the response shape independent of FK direction.
- **`GET /movies/search?q=…`** — substring match against `title` using the `pg_trgm` GIN index (`gin_trgm_ops`). Minimum 2-char query (below that, trigrams can't help). Top-N popularity-ordered results — no cursor, because ranking-based pagination is unstable.

### Avg rating — O(1) reads

The `movies` table carries denormalized `rating_sum` (bigint) and `rating_count` (int) columns. Avg is computed as `rating_sum / NULLIF(rating_count, 0)` directly on the row — no JOIN, no AVG aggregate, no row scan over the ratings table. The ratings module maintains these counters transactionally on every rating write (see [Ratings](#ratings) below).

## Ratings

Each (user, movie) pair has at most one row in `user_ratings`. Three endpoints:

- **`PUT /movies/:id/ratings`** with `{ "value": 1..10 }` — upserts via `ON CONFLICT (user_id, movie_id) DO UPDATE`. Returns the new rating plus the recomputed movie aggregates so the client doesn't need a follow-up GET.
- **`DELETE /movies/:id/ratings`** — strict 404 if the caller has no rating on this movie. DELETE of a specific resource that doesn't exist is treated as a client mistake, not an idempotent no-op.
- **`GET /movies/:id/ratings/me`** — returns the caller's rating row, or 404.

### Counter maintenance

The denormalized `rating_sum` and `rating_count` columns on `movies` are kept in lockstep with `user_ratings` inside a single transaction:

1. `SELECT … FOR UPDATE` on the movies row — row-level lock, serializes all rating writes for this movie.
2. Read the existing rating (if any) inside the lock to compute `(Δsum, Δcount)`.
3. `INSERT … ON CONFLICT DO UPDATE` the rating row, or `DELETE` it.
4. `UPDATE movies SET rating_sum = rating_sum + :Δsum, rating_count = rating_count + :Δcount` — single statement, no read-then-write.
5. Commit.

Locking the movies row (not the rating row) is the only correct approach for the "no rating yet → two concurrent PUTs" case: `SELECT FOR UPDATE` on a missing row doesn't lock anything, so both transactions would otherwise see "no rating", both compute `Δcount = +1`, and the counter would drift.

The cost is that all rating writes against the same movie serialize. For this app it's the right trade-off: aggregate correctness is structural, and contention is per-movie, not global.

### Cache invalidation on writes

Two caches go stale on every rating write:

- `movies:detail:{id}` — deleted directly (the key is enumerable from the movie id).
- `movies:list:*` and `movies:search:*` — invalidated via a shared **version key** in Redis (`movies:rating-version`). The list/search cache keys include a `v{version}` segment. On any rating write, the version is bumped to `Date.now()`; previously-cached entries become unreachable in O(1) and TTL out on their own. Cheaper than `SCAN`-and-`DEL`, and adapter-agnostic.

Cache invalidation runs *after* the transaction commits, never inside. Invalidating before commit would open a window where a reader sees pre-commit DB state and re-populates the cache with stale data.

## Watchlist

A per-user set of movies the caller wants to watch. Three endpoints:

- **`POST /watchlist/:movieId`** — idempotent add. `INSERT … ON CONFLICT (user_id, movie_id) DO NOTHING`; a second call returns the existing entry without changing its `addedAt`. 404 if the movie id is unknown (pre-checked to surface a clean error rather than a translated FK violation).
- **`DELETE /watchlist/:movieId`** — idempotent remove. 204 whether the entry existed or not. Set-membership semantics: "ensure X is not in my watchlist" is satisfied regardless of prior state. (Compare with `DELETE /ratings`, which is strict-404 because a rating carries a *value*, not just membership.)
- **`GET /watchlist`** — cursor-paginated list, most-recent first. Single `LEFT JOIN` to `movies` so each response row carries full movie data — no N+1, one round-trip per page. Pagination keyed on `(addedAt, movieId)`.

### Schema

The `watchlist` table is a pure join/membership table — composite PK `(user_id, movie_id)` + `added_at`, no surrogate id. The composite PK gives us native `ON CONFLICT` support for idempotent inserts and a `WHERE user_id = ?` index for free (the PK starts with user_id).

### Per-user cache invalidation

Each user has their own version key (`watchlist:version:{userId}`) in Redis. List cache keys include the version: `watchlist:{userId}:v{version}:{cursor}:{limit}`. Any write by a user bumps their own version, rendering that user's previously-cached pages unreachable in O(1). User A's writes don't touch user B's cache — important for a per-user resource where global invalidation would be over-broad.

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
| `GET /movies` | `movies:list:v{version}:{limit}:{cursor}:{genreIds}` | 5min + jitter | Cursor + filter included in the key. `version` is bumped by ratings writes (see [Cache invalidation on writes](#cache-invalidation-on-writes)). Jitter prevents stampede on cold start. |
| `GET /movies/:id` | `movies:detail:{id}` | 5min + jitter | Invalidated (`DEL`) on every rating write touching this movie. |
| `GET /movies/search` | `movies:search:v{version}:{q-lower}:{limit}:{genreIds}` | 5min + jitter | `q` is lowercased so `mario` and `Mario` share the entry. Same version-bump invalidation as the list. |
| _(version key)_ | `movies:rating-version` | 30d (refreshed on each rating write) | Holds the current namespace version for `movies:list:*` and `movies:search:*`. Bumped to `Date.now()` on any rating write; orphan entries TTL out. |
| `GET /watchlist` | `watchlist:{userId}:v{version}:{cursor}:{limit}` | 5min + jitter | Per-user cache, scoped by user id. `version` is the per-user version from `watchlist:version:{userId}`. |
| _(per-user version)_ | `watchlist:version:{userId}` | 30d (refreshed on each watchlist write) | Bumped on every add/remove by that user; other users' caches are untouched. |

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

Three layers; integration and e2e need Docker running (testcontainers spawns ephemeral Postgres + Redis).

| Layer | Command | What it covers |
|---|---|---|
| Unit | `npm test` | Pure logic with mocked deps; fast (~3s) |
| Integration | `npm run test:integration` | Real Postgres in a `testcontainer` — TypeORM, constraints, transactions |
| E2E | `npm run test:e2e` | Full app boot, supertest over HTTP, real Postgres + Redis containers |
| All + coverage gate | `npm run test:cov` | Runs all three; fails build if statements <90, branches <70, functions <85, or lines <90 |

CI runs `lint → tsc --noEmit → build → test:cov` on every PR.
