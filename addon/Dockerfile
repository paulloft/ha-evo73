# https://github.com/hassio-addons/addon-base/releases
ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.2.1

FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs npm

COPY rootfs /

RUN chmod a+x /usr/bin/app
RUN chmod a+x /etc/services.d/app/run
RUN chmod a+x /etc/services.d/app/finish

COPY ../src /app/src/
COPY ../package.json ../package-lock.json /app/src/

WORKDIR /app
RUN npm i
