FROM node:22-alpine AS base

WORKDIR /app

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_cache=/tmp/.npm \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

RUN apk add --no-cache openssl

FROM base AS deps

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --no-audit --no-fund && rm -rf /root/.npm
RUN npx prisma generate

FROM deps AS builder

ARG VITE_VIDEO_HELPER_DOWNLOAD_URL=""
ENV VITE_VIDEO_HELPER_DOWNLOAD_URL=${VITE_VIDEO_HELPER_DOWNLOAD_URL}

COPY . .
RUN npm run build

FROM deps AS prod-deps

RUN npm prune --omit=dev --no-audit --no-fund \
    && npx prisma generate \
    && rm -rf /root/.npm \
    && rm -rf node_modules/ffmpeg-static node_modules/ffprobe-static \
    && find node_modules -type f -name '*.map' -delete

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    npm_config_cache=/tmp/.npm

RUN apk add --no-cache openssl ffmpeg su-exec

COPY package*.json ./
COPY prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules

COPY docker ./docker
COPY public ./public
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build

RUN mkdir -p /app/public/uploads /app/storage/video-jobs /app/storage/video-export \
    && chmod +x /app/docker/entrypoint.sh \
    && chown -R node:node /app/public /app/storage /app/dist /app/build

EXPOSE 3001

ENTRYPOINT ["/bin/sh", "./docker/entrypoint.sh"]
CMD ["node", "build/server/index.js"]
