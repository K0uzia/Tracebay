# Minimal API server image
FROM node:20-bookworm

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8060
CMD ["node", "server.js"]
