FROM node:20-bookworm

# Set workdir at repo root to preserve relative imports to ../../config
WORKDIR /app

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
COPY config ./config

# Install dependencies using root lock file
RUN npm ci --workspace=apps/proxmox --include-workspace-root \
    && npm run build --workspace=apps/proxmox

ENV NODE_ENV=production
ENV PORT=4000
ENV LOG_LEVEL=info
WORKDIR /app/apps/proxmox
EXPOSE 4000

# Use tini to handle signals properly
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
