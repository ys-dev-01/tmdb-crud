# Multi-stage build for production.
#
# Three stages:
#   1. builder    — compiles TypeScript -> dist/. Has dev deps installed.
#   2. prod-deps  — installs only runtime deps (no typescript, jest, etc).
#   3. production — final image. Contains node + prod node_modules + dist/.
#
# The final image carries no source TS, no build toolchain, no test code.
# Target size: < 200 MB.

# ----- 1. Builder -----
FROM node:24-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) so we can run `nest build`. Layer cached
# across rebuilds when package*.json don't change.
COPY package.json package-lock.json ./
RUN npm ci

# Copy build config + source, then compile.
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ----- 2. Production deps -----
# Resolved in a separate stage so the final image gets ONLY runtime deps —
# no typescript, jest, eslint, etc. (~hundreds of MB saved).
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ----- 3. Final runtime image -----
FROM node:24-alpine AS production
WORKDIR /app

# Bring in only what runtime needs.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# node:alpine ships a pre-created non-root `node` user (uid 1000).
# Drop root permanently — a process compromise can't write to /app
# (owned by root from the COPY chain above; app reads but doesn't
# write its own code at runtime).
USER node

EXPOSE 8080

# Exec form so SIGTERM reaches Node directly for graceful shutdown.
# `node` not `npm start` — npm wraps the process and complicates
# signal forwarding.
CMD ["node", "dist/main"]
