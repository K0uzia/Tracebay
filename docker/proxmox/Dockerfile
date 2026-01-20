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
COPY apps/proxmox/package*.json apps/proxmox/tsconfig.json ./apps/proxmox/
COPY apps/proxmox/src ./apps/proxmox/src

# Install dependencies using root lock file
RUN echo "Cache buster: ${CACHE_BUSTER}" \
    && npm ci \
    && npm run build --workspace=apps/proxmox \
    && mkdir -p apps/proxmox/dist/db \
    && cp apps/proxmox/src/db/schema.sql apps/proxmox/dist/db/schema.sql

ENV NODE_ENV=production
ENV PORT=4000
ENV LOG_LEVEL=info
WORKDIR /app/apps/proxmox
EXPOSE 4000

# Use tini to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
