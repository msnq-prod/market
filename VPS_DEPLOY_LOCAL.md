# Local VPS Deploy Runbook

Этот файл можно использовать как локальный шаблон развертывания.

Важно:

- не храните в нем реальные production secrets;
- перед практическим использованием подставьте свои значения локально;
- если файл снова окажется в git, он должен содержать только шаблонные данные.

## 1. Что нужно заполнить

- `VPS_IP`
- `SSH_USER`
- `APP_DOMAIN`
- `ACME_EMAIL`
- `VITE_VIDEO_HELPER_DOWNLOAD_URL`
- `MYSQL_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`

## 2. Пример `.env.production`

```env
APP_DOMAIN=<APP_DOMAIN>
ACME_EMAIL=<ACME_EMAIL>

PORT=3001
CLIENT_URL=https://<APP_DOMAIN>

MYSQL_DATABASE=stones
MYSQL_USER=stones
MYSQL_PASSWORD=<GENERATE_STRONG_PASSWORD>
MYSQL_ROOT_PASSWORD=<GENERATE_STRONG_ROOT_PASSWORD>

DATABASE_URL=mysql://stones:<GENERATE_STRONG_PASSWORD>@db:3306/stones?connection_limit=20&pool_timeout=30

ACCESS_TOKEN_SECRET=<GENERATE_LONG_RANDOM_SECRET>
REFRESH_TOKEN_SECRET=<GENERATE_LONG_RANDOM_SECRET>

VIDEO_PROCESSOR_POLL_MS=3000

VITE_VIDEO_HELPER_DOWNLOAD_URL=<VITE_VIDEO_HELPER_DOWNLOAD_URL>
STONES_HELPER_ALLOWED_ORIGIN=https://<APP_DOMAIN>
```

## 3. DNS

Нужно создать:

- `A` запись: `<APP_DOMAIN> -> <VPS_IP>`

Проверка:

```bash
dig +short <APP_DOMAIN>
```

## 4. Подготовка сервера

Минимум:

- Ubuntu 24.04 LTS или Debian 12
- открыты `22`, `80`, `443`
- установлен `git`
- установлен `docker`
- установлен `docker compose plugin`
- установлен `node` и `npm`, если хотите пользоваться `npm run ops:*`

## 5. Доставка проекта

```bash
ssh <SSH_USER>@<VPS_IP>
mkdir -p ~/apps
cd ~/apps
git clone <REPO_URL> stones
cd stones
git checkout main
```

## 6. Первый deploy

```bash
cd ~/apps/stones
cp .env.production.example .env.production
nano .env.production
npm install
npm run ops:preflight
npm run ops:deploy
```

## 7. Проверка

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -k -I https://<APP_DOMAIN>/healthz
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 app
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 caddy
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail 100 video-processor
```

Ручной smoke:

- открыть `https://<APP_DOMAIN>`
- открыть `/admin/login`
- открыть `/partner/login`
- проверить `clone` URL

## 8. Nightly backup

Пример cron:

```cron
0 3 * * * cd /home/<SSH_USER>/apps/stones && /usr/bin/npm run ops:backup >> /home/<SSH_USER>/stones-backup.log 2>&1
```

## 9. GitHub Actions CI/CD

В репозитории есть workflow `.github/workflows/ci-cd.yml`.

Что нужно добавить в GitHub repository settings:

- secret `STONES_PROD_SSH_PRIVATE_KEY`
- variable `STONES_PROD_SSH_HOST=<VPS_IP>`
- variable `STONES_PROD_SSH_PORT=22`
- variable `STONES_PROD_SSH_USER=<SSH_USER>`
- variable `STONES_PROD_APP_DIR=/root/apps/stones`

Для server-side deploy используется:

```bash
./scripts/ops/deploy-revision.sh <commit_sha>
```

## 10. Rollback

Если проблема в коде:

```bash
cd ~/apps/stones
git log --oneline -n 5
git checkout <previous_commit_or_tag>
npm run ops:deploy
```

Если проблема в данных:

```bash
ls -lt ops/backups/mysql
./scripts/ops/restore-db.sh ops/backups/mysql/<backup-file>.sql.gz --yes
```
