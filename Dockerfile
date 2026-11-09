# ==============================================================================
# Trounce: production image
# Multi-stage build. The final image has only runtime dependencies and runs as
# a non-root user.
# ==============================================================================

# 1. Build stage: all dependencies, compile client and server
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
RUN npm run build

# 2. Runtime dependencies only
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3. Final image
FROM node:22-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs trounce

WORKDIR /app

COPY --chown=trounce:nodejs --from=prod-deps /app/node_modules ./node_modules
COPY --chown=trounce:nodejs --from=builder /app/package.json ./package.json
COPY --chown=trounce:nodejs --from=builder /app/dist ./dist
COPY --chown=trounce:nodejs --from=builder /app/scripts/serve.mjs ./scripts/serve.mjs

# Local audio cache. MongoDB GridFS holds the durable copy.
RUN mkdir -p /app/.storage/audio && chown -R trounce:nodejs /app/.storage

USER trounce

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve.mjs"]
