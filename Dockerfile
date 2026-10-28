# https://github.com/hassio-addons/addon-base/releases
ARG BUILD_FROM=ghcr.io/hassio-addons/base:21.0.10

FROM node:26-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
COPY app/package.json ./app/package.json
RUN npm ci
COPY tsconfig.json tsconfig.tests.json eslint.config.mjs ./
COPY tests/ ./tests/
COPY src/ ./src/
COPY app/ ./app/
RUN npm run check && npm run build

FROM node:26-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY app/package.json ./app/package.json
RUN npm ci --omit=dev --workspaces=false

FROM ${BUILD_FROM}
ARG BUILD_VERSION=dev
LABEL io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    org.opencontainers.image.source="https://github.com/paulloft/ha-evo73" \
    org.opencontainers.image.version="${BUILD_VERSION}"
COPY ./rootfs/ /
COPY --from=build /build/src/ /app/src/
COPY --from=build /build/public/ /app/public/
COPY --from=dependencies /app/node_modules/ /app/node_modules/
COPY .env package.json /app/
RUN chmod a+x /usr/bin/app \
    && chmod a+x /etc/services.d/app/run \
    && chmod a+x /etc/services.d/app/finish \
    && apk add --no-cache nodejs-current
WORKDIR /app
