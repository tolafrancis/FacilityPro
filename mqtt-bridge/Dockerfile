# FacilityPro MQTT bridge worker.
# Build:  docker build -t facilitypro-mqtt-bridge ./mqtt-bridge
# Run:    docker run --env-file mqtt-bridge/.env facilitypro-mqtt-bridge
FROM node:20-alpine

WORKDIR /app

# Install deps first for better layer caching. Reproducible build from the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY index.mjs ./

# Run as the built-in non-root user shipped with the node image.
USER node

ENV NODE_ENV=production
CMD ["node", "index.mjs"]
