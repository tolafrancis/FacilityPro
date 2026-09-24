# FacilityPro edge gateway.
# Build:  docker build -t facilitypro-iot-gateway ./iot-gateway
# Run:    docker run -d --restart unless-stopped --env-file iot-gateway/.env \
#           -v facilitypro-gw:/data facilitypro-iot-gateway
# Modbus RTU (serial): build with --build-arg WITH_SERIAL=true and run with
#   --device /dev/ttyUSB0
FROM node:20-alpine

ARG WITH_SERIAL=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN if [ "$WITH_SERIAL" = "true" ]; then npm ci --omit=dev --no-audit --no-fund; \
    else npm ci --omit=dev --omit=optional --no-audit --no-fund; fi

COPY index.mjs ./
COPY src ./src

RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production
CMD ["node", "index.mjs"]
