FROM node:20-bookworm

# Set workdir
WORKDIR /app

# Cache-busting argument to force rebuild of build steps
ARG CACHE_BUSTER=initial

# Install system dependencies (curl pour healthcheck, tini pour signal handling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Copy app package files
COPY proxmox/app/package*.json proxmox/app/tsconfig.json ./

# Copy source code
COPY proxmox/app/src ./src

# Install dependencies and build
RUN echo "Cache buster: ${CACHE_BUSTER}" \
    && npm ci \
    && npm run build \
    && mkdir -p dist/db dist/views \
    && cp src/db/schema.sql dist/db/schema.sql \
    && cp src/views/monitoring.html dist/views/monitoring.html 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=4000
ENV LOG_LEVEL=info
EXPOSE 4000

# Use tini to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
