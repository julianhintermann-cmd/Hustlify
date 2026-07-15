# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend -----------------------------------
FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: production runtime -----------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
# Defaults for the self-hosted deployment; both are mounted as volumes.
ENV CONFIG_PATH=/config/config.yaml
ENV DATA_DIR=/data
WORKDIR /app

# Install production dependencies only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code and the built frontend.
COPY server/ ./server/
COPY --from=web /web/dist ./web/dist

# Persistent data (SQLite DB + session secret) and the mounted config.
RUN mkdir -p /data /config && chown -R node:node /app /data /config
VOLUME ["/data", "/config"]
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "server/healthcheck.js"]

CMD ["node", "server/index.js"]
