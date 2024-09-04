# https://github.com/hassio-addons/addon-base/releases
ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.2.1

FROM ${BUILD_FROM}

COPY ./rootfs/ /
COPY ./src/ /app/src/
COPY .env package.json package-lock.json  /app/

RUN chmod a+x /usr/bin/app \
&& chmod a+x /etc/services.d/app/run \
&& chmod a+x /etc/services.d/app/finish

WORKDIR /app
RUN apk add --no-cache nodejs npm && npm i
