# Multi-stage production Dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files (both package.json and package-lock.json if present)
COPY package*.json ./

# Install dependencies (with --legacy-peer-deps to avoid npm arborist edgesOut issue)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build Vite frontend and compiled server
RUN npm run build

# Production runtime stage
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package definition
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Copy built bundle and runtime assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder /app/metadata.json ./metadata.json

# Ensure data directory exists for local fallback cache
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/server.cjs"]
