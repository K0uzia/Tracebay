FROM node:20-bookworm

# Set workdir at repo root to preserve relative imports to ../../config
WORKDIR /app

# Cache-busting argument to force rebuild of build steps
ARG CACHE_BUSTER=initial

# Install system dependencies (curl pour healthcheck, tini pour signal handling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Copy root package files for monorepo structure
COPY package.json package-lock.json ./

# Copy workspace specific files
COPY proxmox/app/package*.json proxmox/app/tsconfig.json ./proxmox/app/
COPY proxmox/app/src ./proxmox/app/src

# Install dependencies using root lock file
RUN echo "Cache buster: ${CACHE_BUSTER}" \
    && npm ci \
    && npm run build --workspace=proxmox/app \
    && mkdir -p proxmox/app/dist/db \
    && cp proxmox/app/src/db/schema.sql proxmox/app/dist/db/schema.sql

ENV NODE_ENV=production
ENV PORT=4000
ENV LOG_LEVEL=info
WORKDIR /app/proxmox/app
EXPOSE 4000

# Use tini to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
