# Multi-stage production Dockerfile
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Reproducible dependency installation from the committed lockfile.
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/metadata.json ./metadata.json
COPY --from=builder /app/openapi.json ./openapi.json

RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const http=require('http');http.get('http://127.0.0.1:3000/api/health/live',(r)=>{process.exit(r.statusCode===200?0:1);}).on('error',()=>process.exit(1));"

CMD ["node", "dist/server.cjs"]
