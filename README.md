# TMDB CRUD API

NestJS service backed by PostgreSQL.

## Prerequisites

- Docker with the Compose v2 plugin (`docker compose`)

## Quick start

```bash
cp .env.example .env
docker compose up
```

Before starting, you need a TMDB v3 API key (free): sign up at <https://www.themoviedb.org/settings/api>, then put the 32-character key in `.env` as `TMDB_API_KEY`.

- App: <http://localhost:8080>
- Swagger UI: <http://localhost:8080/api>
- Health check: <http://localhost:8080/health>
- Genres: <http://localhost:8080/genres>

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

Env is validated at startup via Joi; the app exits if anything is missing or invalid.

## Project structure

```
src/
├── config/        # Joi env validation schema
├── database/      # TypeORM connection + migrations
├── genres/        # /genres endpoint + TMDB sync
├── health/        # /health endpoint
├── tmdb/          # TmdbClient (axios + retry)
├── auth/          # RefreshToken entity (logic lands later)
├── users/         # User entity
├── movies/        # Movie + MovieGenre entities
├── ratings/       # Rating entity
├── watchlist/     # WatchlistEntry entity
├── favorites/     # FavoriteEntry entity
├── app.module.ts
└── main.ts
```

Entities for unimplemented features (auth, movies, ratings, watchlist, favorites) live alongside the modules they will belong to; the schema was designed upfront in [`docs/schema.md`](docs/schema.md).

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | App + Postgres reachability check |
| GET | `/genres` | List all genres (synced from TMDB at boot) |
| GET | `/api` | Swagger UI |
| GET | `/api-json` | OpenAPI spec |

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

## Tests

```bash
npm test
```
