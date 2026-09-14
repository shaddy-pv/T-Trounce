# ==============================================================================
# Trounce (Signal Speak Studio) — Production Dockerfile
# Multi-stage, minimal footprint, non-root secure Alpine image
# ==============================================================================

# 1. Base stage: dependencies and caching
FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools if needed
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
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/.output ./.output 2>/dev/null || true
COPY --from=builder /app/public ./public 2>/dev/null || true

USER trounce

EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
