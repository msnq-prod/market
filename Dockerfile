# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

WORKDIR /app

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    FFMPEG_BIN=/bin/true \
    npm_config_cache=/tmp/.npm \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

RUN apk add --no-cache openssl

FROM base AS deps

COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm pkg delete dependencies.ffmpeg-static dependencies.ffprobe-static optionalDependencies.electron optionalDependencies.electron-builder

RUN --mount=type=cache,target=/tmp/.npm \
    sh -lc 'attempt=1; \
    while [ "$attempt" -le 4 ]; do \
        npm ci --prefer-offline --no-audit --no-fund && exit 0; \
        echo "npm ci failed on attempt $attempt, retrying..."; \
        rm -rf node_modules; \
        attempt=$((attempt + 1)); \
        sleep 5; \
    done; \
    exit 1'
RUN npx prisma generate

FROM deps AS builder

ARG VITE_SENTRY_DSN_FRONTEND=""
ARG VITE_SENTRY_ENVIRONMENT="production"
ENV VITE_SENTRY_DSN_FRONTEND=${VITE_SENTRY_DSN_FRONTEND}
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}

COPY . .
RUN npm run typecheck \
    && npm run build:server \
    && npm run build:client

FROM base AS prod-deps

COPY --from=builder /app/build/server/index.js /tmp/build-server-index.js
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN npm pkg delete dependencies.ffmpeg-static dependencies.ffprobe-static optionalDependencies.electron optionalDependencies.electron-builder

RUN --mount=type=cache,target=/tmp/.npm \
    npm ci --omit=dev --prefer-offline --no-audit --no-fund \
    && npx prisma generate \
    && rm -rf node_modules/app-builder-bin \
    && find node_modules -type f -name '*.map' -delete

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    npm_config_cache=/tmp/.npm

RUN apk add --no-cache openssl su-exec ffmpeg

COPY package*.json ./
COPY prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules

COPY docker ./docker
COPY public ./public
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build

RUN mkdir -p /app/public/uploads /app/storage \
    && chmod +x /app/docker/entrypoint.sh \
    && chown -R node:node /app/public /app/storage /app/dist /app/build

EXPOSE 3001

ENTRYPOINT ["/bin/sh", "./docker/entrypoint.sh"]
CMD ["node", "build/server/index.js"]
