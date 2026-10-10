# Multi-stage production Dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files (package.json and package-lock.json)
COPY package.json package-lock.json ./

# Install dependencies deterministically via npm ci
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build Vite frontend and compiled server
RUN npm run build

# Production runtime stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install PostgreSQL 16.x client tools (pg_dump & psql v16) from official PostgreSQL PGDG repository
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg && \
    echo "deb http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends postgresql-client-16 && \
    apt-get purge -y --auto-remove curl gnupg && \
    rm -rf /var/lib/apt/lists/*

# Copy package definition and lockfile
COPY package.json package-lock.json ./

# Install production dependencies deterministically via npm ci
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built bundle and runtime assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json

# Ensure clean runtime directories exist for volumes, secrets and local state, and transfer ownership to unprivileged node user
RUN mkdir -p /app/data /app/secrets /app/uploads /app/logs /app/backups /run/secrets && \
    chown -R node:node /app /run/secrets && \
    chmod 755 /run/secrets

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1:3000/api/health/live',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

CMD ["node", "dist/server.cjs"]
