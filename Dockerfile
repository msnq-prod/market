# syntax=docker/dockerfile:1.7
FROM node:22-alpine

WORKDIR /app

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_cache=/tmp/.npm \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

RUN apk add --no-cache openssl ffmpeg

COPY package*.json ./
COPY prisma ./prisma

RUN --mount=type=cache,target=/tmp/.npm npm ci --no-audit --no-fund && rm -rf /root/.npm
RUN npx prisma generate
RUN rm -rf \
    node_modules/@electron \
    node_modules/@playwright \
    node_modules/7zip-bin \
    node_modules/app-builder-bin \
    node_modules/app-builder-lib \
    node_modules/builder-util \
    node_modules/builder-util-runtime \
    node_modules/dmg-builder \
    node_modules/dmg-license \
    node_modules/electron \
    node_modules/electron-builder \
    node_modules/electron-builder-squirrel-windows \
    node_modules/electron-publish \
    node_modules/electron-winstaller \
    node_modules/ffmpeg-static \
    node_modules/ffprobe-static \
    node_modules/playwright \
    node_modules/playwright-core \
    node_modules/postject
RUN find node_modules -type f -name '*.map' -delete

COPY . .

EXPOSE 3001 5173

CMD ["/bin/sh", "./docker/entrypoint.sh"]
