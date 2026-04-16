# Полный пакет документации ZAGARAMI

Актуально на 14.04.2026.

Этот документ собирает весь комплект документации по системе ZAGARAMI в одном месте и показывает:

- какие документы входят в пакет;
- для кого предназначен каждый документ;
- в каком порядке их читать;
- какие документы можно передавать заказчику, операционной команде и технической команде.

Документ опирается на фактическое состояние текущего репозитория, а не на целевую модель "на будущее". В репозитории и части технических идентификаторов сохраняется внутреннее имя `stones`.

## 1. Что входит в полный пакет

Полный пакет документации состоит из пяти блоков:

1. Общее описание системы.
2. Бизнес-процессы и карта процессов.
3. Руководства по ролям.
4. Техническая и эксплуатационная документация.
5. Deployment и production runbook.

## 2. Состав пакета по блокам

### 2.1 Общие документы

- [README.md](../README.md) — краткий вход в проект: назначение, стек, запуск, ссылки на основные документы.
- [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md) — общее подробное руководство по системе целиком.
- [BUSINESS_LOGIC_RU.md](./BUSINESS_LOGIC_RU.md) — текущая предметная логика, роли, статусы и реальные переходы.

### 2.2 Документы для заказчика и аудита

- [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md) — полное описание системы простым языком и перечень процессов для аудита.
- [BUSINESS_PROCESS_MAP_RU.md](./BUSINESS_PROCESS_MAP_RU.md) — визуальная карта процессов.
- [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md) — управленческий взгляд на систему для владельца бизнеса.

### 2.3 Руководства по ролям

- [USER_GUIDE_ADMIN_RU.md](./USER_GUIDE_ADMIN_RU.md) — работа HQ: приемка, склад, заказы, каталог, пользователи.
- [USER_GUIDE_FRANCHISEE_RU.md](./USER_GUIDE_FRANCHISEE_RU.md) — работа франчайзи: задачи на сбор, партии, финансы.
- [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md) — управленческий контроль и основные KPI.

### 2.4 Технический пакет

- [ARCHITECTURE.md](./ARCHITECTURE.md) — фактическая архитектура приложения.
- [RULES.md](./RULES.md) — правила развития системы и ограничения по изменениям.
- [TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./TEST_CREDENTIALS_AND_TECH_INFO_RU.md) — тестовые креды, seed-данные, URL и API.

### 2.5 Эксплуатация и deployment

- [DOCKER_RU.md](./DOCKER_RU.md) — локальный Docker и production stack.
- [OPERATIONS.md](./OPERATIONS.md) — deploy, backup, restore, rollback.
- [VPS_DEPLOY_LOCAL.md](../VPS_DEPLOY_LOCAL.md) — шаблон локального VPS-runbook без секретов.

## 3. Кому какой документ нужен

### Заказчик

Рекомендуемый набор:

- [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md)
- [BUSINESS_PROCESS_MAP_RU.md](./BUSINESS_PROCESS_MAP_RU.md)
- [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md)

Этот набор нужен, чтобы:

- понять, что уже умеет система;
- увидеть карту процессов;
- провести бизнес-аудит;
- обсудить зоны развития без погружения в код.

### Руководитель бизнеса

Рекомендуемый набор:

- [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md)
- [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md)
- [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)

### HQ-команда

Рекомендуемый набор:

- [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)
- [USER_GUIDE_ADMIN_RU.md](./USER_GUIDE_ADMIN_RU.md)
- [BUSINESS_LOGIC_RU.md](./BUSINESS_LOGIC_RU.md)

### Франчайзи

Рекомендуемый набор:

- [USER_GUIDE_FRANCHISEE_RU.md](./USER_GUIDE_FRANCHISEE_RU.md)
- [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)

### Техническая команда

Рекомендуемый набор:

- [README.md](../README.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./TEST_CREDENTIALS_AND_TECH_INFO_RU.md)
- [DOCKER_RU.md](./DOCKER_RU.md)
- [OPERATIONS.md](./OPERATIONS.md)
- [RULES.md](./RULES.md)
- [VPS_DEPLOY_LOCAL.md](../VPS_DEPLOY_LOCAL.md)

## 4. Рекомендуемый порядок чтения

### Если пакет читают впервые

1. [README.md](../README.md)
2. [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)
3. [BUSINESS_LOGIC_RU.md](./BUSINESS_LOGIC_RU.md)

### Если пакет читают как заказчик

1. [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md)
2. [BUSINESS_PROCESS_MAP_RU.md](./BUSINESS_PROCESS_MAP_RU.md)
3. [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md)

### Если пакет читают как HQ-операторы

1. [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)
2. [USER_GUIDE_ADMIN_RU.md](./USER_GUIDE_ADMIN_RU.md)
3. [TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./TEST_CREDENTIALS_AND_TECH_INFO_RU.md)

### Если пакет читают как техкоманда

1. [README.md](../README.md)
2. [ARCHITECTURE.md](./ARCHITECTURE.md)
3. [DOCKER_RU.md](./DOCKER_RU.md)
4. [OPERATIONS.md](./OPERATIONS.md)
5. [TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./TEST_CREDENTIALS_AND_TECH_INFO_RU.md)

## 5. Что уже покрывает пакет документации

Пакет уже описывает:

- публичную витрину;
- buyer-авторизацию и подачу заявки на покупку;
- HQ-контур;
- контур франчайзи;
- каталог, локации и товарные шаблоны;
- задачи на сбор;
- партии и item;
- цифровой паспорт;
- QR;
- склад;
- allocation;
- видео-инструменты HQ;
- базовый финансовый кабинет партнера;
- роли и права доступа;
- seed-данные;
- deploy и эксплуатацию.

## 6. Что важно понимать при передаче пакета

Этот пакет фиксирует именно текущую реализованную систему.

Это значит:

- checkout сейчас работает как заявка, а не как реальная оплата;
- Telegram login пока не подключен;
- цифровой паспорт привязан к `Item`, а не к `Product`;
- публичная активация не создает финансовые проводки автоматически;
- offline-consignment как новый рабочий сценарий через UI сейчас не используется;
- часть старых состояний еще может встречаться в seed-данных и модели данных.

## 7. Минимальный комплект для передачи заказчику

Если нужен именно клиентский пакет без технических деталей, достаточно передать:

1. [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md)
2. [BUSINESS_PROCESS_MAP_RU.md](./BUSINESS_PROCESS_MAP_RU.md)
3. [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md)
4. [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)

## 8. Полный комплект для внутренней команды

Для полной внутренней передачи используйте весь набор:

1. [README.md](../README.md)
2. [SYSTEM_USAGE_GUIDE_RU.md](./SYSTEM_USAGE_GUIDE_RU.md)
3. [BUSINESS_LOGIC_RU.md](./BUSINESS_LOGIC_RU.md)
4. [BUSINESS_PROCESSES_AUDIT_RU.md](./BUSINESS_PROCESSES_AUDIT_RU.md)
5. [BUSINESS_PROCESS_MAP_RU.md](./BUSINESS_PROCESS_MAP_RU.md)
6. [USER_GUIDE_ADMIN_RU.md](./USER_GUIDE_ADMIN_RU.md)
7. [USER_GUIDE_FRANCHISEE_RU.md](./USER_GUIDE_FRANCHISEE_RU.md)
8. [USER_GUIDE_OWNER_RU.md](./USER_GUIDE_OWNER_RU.md)
9. [ARCHITECTURE.md](./ARCHITECTURE.md)
10. [TEST_CREDENTIALS_AND_TECH_INFO_RU.md](./TEST_CREDENTIALS_AND_TECH_INFO_RU.md)
11. [DOCKER_RU.md](./DOCKER_RU.md)
12. [OPERATIONS.md](./OPERATIONS.md)
13. [RULES.md](./RULES.md)
14. [VPS_DEPLOY_LOCAL.md](../VPS_DEPLOY_LOCAL.md)

## 9. Точка входа в пакет

Если нужен один главный файл, открывайте сначала этот документ:

- [DOCUMENTATION_PACKAGE_RU.md](./DOCUMENTATION_PACKAGE_RU.md)

После него уже можно переходить по нужному маршруту чтения под свою роль.
