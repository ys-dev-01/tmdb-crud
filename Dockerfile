# Single-stage Dockerfile for the walking skeleton.
# PR #11 (chore/polish) upgrades this to multi-stage with a non-root user.

FROM node:24-alpine

WORKDIR /app

# Install deps first to leverage Docker layer cache.
# When package*.json don't change, this layer is reused even if src/ changes.
COPY package*.json ./
RUN npm ci

# Copy build config + source
COPY tsconfig*.json nest-cli.json ./
COPY src ./src

# Compile TypeScript -> dist/
RUN npm run build

# Documentation only; docker-compose publishes the port.
EXPOSE 8080

# Exec form so SIGTERM reaches Node directly for graceful shutdown.
CMD ["node", "dist/main"]
