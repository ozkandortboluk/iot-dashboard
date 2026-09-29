# Multi-stage production Dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files (both package.json and package-lock.json if present)
COPY package*.json ./

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

# Copy package definition and lockfile
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy built bundle and runtime assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json

# Ensure clean runtime directories exist for volumes and local state, and transfer ownership to unprivileged node user
RUN mkdir -p /app/data /app/secrets /app/uploads /app/logs /app/backups && \
    chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1:3000/api/health/live',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

CMD ["node", "dist/server.cjs"]
