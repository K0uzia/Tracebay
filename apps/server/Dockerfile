# Minimal API server image
FROM node:20-bookworm

WORKDIR /app

# Copy root package files for monorepo structure
COPY package.json package-lock.json ./

# Copy workspace specific files
COPY apps/server/package*.json ./apps/server/
COPY apps/server/lib ./apps/server/lib
COPY apps/server/routes ./apps/server/routes
COPY apps/server/public ./apps/server/public
COPY apps/server/middleware ./apps/server/middleware
COPY apps/server/models ./apps/server/models
COPY apps/server/*.js ./apps/server/

# Install dependencies using root lock file
RUN npm ci --workspace=apps/server --omit=dev

WORKDIR /app/apps/server
EXPOSE 8060
CMD ["node", "server.js"]
