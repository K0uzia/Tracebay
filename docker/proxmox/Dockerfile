FROM node:20-alpine

# Set workdir at repo root to preserve relative imports to ../../config
WORKDIR /app

# Install app dependencies
COPY apps/proxmox/package*.json apps/proxmox/tsconfig.json ./apps/proxmox/
COPY apps/proxmox/src ./apps/proxmox/src
COPY config ./config

RUN cd apps/proxmox \
    && npm install --production=false \
    && npm run build

ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app/apps/proxmox
EXPOSE 4000

CMD ["node", "dist/main.js"]
