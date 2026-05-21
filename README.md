# TMDB CRUD API

NestJS service backed by PostgreSQL.

## Prerequisites

- Docker with the Compose v2 plugin (`docker compose`)

## Quick start

```bash
cp .env.example .env
docker compose up
```

- App: <http://localhost:8080>
- Swagger UI: <http://localhost:8080/api>
- Health check: <http://localhost:8080/health>

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

Env is validated at startup via Joi; the app exits if anything is missing or invalid.

## Project structure

```
src/
├── config/        # Joi env validation schema
├── database/      # TypeORM connection + migrations dir
├── health/        # /health endpoint
├── app.module.ts
└── main.ts
```

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | App + Postgres reachability check |
| GET | `/api` | Swagger UI |
| GET | `/api-json` | OpenAPI spec |
