# ─── LittleLoop — multi-stage production Dockerfile ──────────────────────
#
# Stage 1: install production dependencies
# Stage 2: lightweight runtime image
#
# Build:   docker build -t littleloop .
# Run:     docker run -p 3000:3000 littleloop
# ──────────────────────────────────────────────────────────────────────────

# ── Stage 1: deps ─────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Copy manifest first so Docker layer-caches npm install
COPY package.json package-lock.json* ./

# Install production deps only
# Uses Node.js 22 built-in sqlite — no native compilation needed
RUN npm ci --omit=dev

# ── Stage 2: runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Non-root user for security
RUN addgroup -S littleloop && adduser -S littleloop -G littleloop

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY server/ ./server/
COPY index.html styles.css app.js ./

# Data directory (used by SQLite; mount a volume in production)
RUN mkdir -p /app/data && chown -R littleloop:littleloop /app

USER littleloop

EXPOSE 3000

# Health check — used by ECS / ALB target group
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/index.js"]
