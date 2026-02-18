FROM public.ecr.aws/docker/library/node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci
RUN npx prisma generate

COPY . .

EXPOSE 3001 5173

CMD ["/bin/sh", "./docker/entrypoint.sh"]
