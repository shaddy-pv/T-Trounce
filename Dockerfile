# ==============================================================================
# Trounce (Signal Speak Studio) — Production Dockerfile
# Multi-stage, minimal footprint, non-root secure Alpine image
# ==============================================================================

# 1. Base stage: dependencies and caching
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# 2. Builder stage: compile frontend and server code
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN npm run build

# 3. Production runner stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 trounce

# Ensure local storage directory exists with proper permissions
RUN mkdir -p /app/.storage/audio && chown -R trounce:nodejs /app/.storage

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/vite.config.ts ./vite.config.ts
COPY --from=builder /app/dist ./dist

USER trounce

EXPOSE 3000

# Dynamically listen on $PORT provided by Render/PaaS or default to 3000
CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-3000}"]
