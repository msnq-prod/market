import { PrismaClient } from '@prisma/client';
import { assertTelegramEncryptionConfigured, decryptTelegramBotToken } from './services/telegramCrypto.ts';
import { getTelegramUpdates, isRetryableTelegramApiError, sendTelegramTextMessage } from './services/telegramClient.ts';

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = Number(process.env.TELEGRAM_WORKER_POLL_MS || '5000');
const RETRY_BASE_MS = Number(process.env.TELEGRAM_WORKER_RETRY_BASE_MS || '5000');
const MAX_ATTEMPTS = Number(process.env.TELEGRAM_WORKER_MAX_ATTEMPTS || '5');

const sleep = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

const log = (...args: unknown[]) => {
    console.log('[telegram-worker]', ...args);
};

const normalizePollingValue = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;

const claimNextJob = async () => {
    const candidate = await prisma.telegramNotificationJob.findFirst({
        where: {
            status: 'PENDING',
            next_attempt_at: {
                lte: new Date()
            }
        },
        orderBy: { created_at: 'asc' },
        select: {
            id: true
        }
    });

    if (!candidate) {
        return null;
    }

    const claim = await prisma.telegramNotificationJob.updateMany({
        where: {
            id: candidate.id,
            status: 'PENDING'
        },
        data: {
            status: 'PROCESSING'
        }
    });
    if (claim.count === 0) {
        return null;
    }

    return prisma.telegramNotificationJob.findUnique({
        where: { id: candidate.id },
        include: {
            bot: {
                select: {
                    id: true,
                    encrypted_token: true,
                    name: true
                }
            }
        }
    });
};

const processPendingJobs = async () => {
    while (true) {
        const job = await claimNextJob();
        if (!job) {
            return;
        }

        try {
            if (!job.bot.encrypted_token) {
                throw new Error(`У Telegram-бота ${job.bot.name} не сохранен token.`);
            }

            const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
                ? job.payload as { text?: unknown }
                : {};
            const text = typeof payload.text === 'string' ? payload.text : '';
            if (!text.trim()) {
                throw new Error(`У job ${job.id} отсутствует текст сообщения.`);
            }

            const token = decryptTelegramBotToken(job.bot.encrypted_token);
            await sendTelegramTextMessage(token, job.recipient_target, text);

            await prisma.telegramNotificationJob.update({
                where: { id: job.id },
                data: {
                    status: 'SENT',
                    sent_at: new Date(),
                    last_error: null
                }
            });
        } catch (error) {
            const attempts = job.attempts + 1;
            const shouldRetry = attempts < normalizePollingValue(MAX_ATTEMPTS, 5) && isRetryableTelegramApiError(error);
            await prisma.telegramNotificationJob.update({
                where: { id: job.id },
                data: {
                    status: shouldRetry ? 'PENDING' : 'FAILED',
                    attempts,
                    next_attempt_at: shouldRetry
                        ? new Date(Date.now() + normalizePollingValue(RETRY_BASE_MS, 5000) * (2 ** Math.max(0, attempts - 1)))
                        : job.next_attempt_at,
                    last_error: error instanceof Error ? error.message : 'Неизвестная ошибка отправки Telegram.'
                }
            });
            log('job failed', job.id, error instanceof Error ? error.message : error);
        }
    }
};

const syncBotContacts = async () => {
    const bots = await prisma.telegramBot.findMany({
        where: {
            encrypted_token: {
                not: null
            }
        },
        select: {
            id: true,
            name: true,
            encrypted_token: true,
            update_offset: true
        }
    });

    for (const bot of bots) {
        if (!bot.encrypted_token) {
            continue;
        }

        try {
            const token = decryptTelegramBotToken(bot.encrypted_token);
            const updates = await getTelegramUpdates(token, {
                offset: bot.update_offset,
                timeoutSeconds: 2
            });
            if (updates.length === 0) {
                continue;
            }

            let nextOffset = bot.update_offset;
            for (const update of updates) {
                nextOffset = Math.max(nextOffset, update.update_id + 1);
                const message = update.message;
                const text = message?.text?.trim() || '';
                const chat = message?.chat;
                if (!chat || !text.startsWith('/start')) {
                    continue;
                }

                await prisma.telegramBotContact.upsert({
                    where: {
                        bot_id_chat_id: {
                            bot_id: bot.id,
                            chat_id: String(chat.id)
                        }
                    },
                    update: {
                        chat_type: chat.type,
                        username: chat.username || null,
                        first_name: chat.first_name || null,
                        last_name: chat.last_name || null,
                        started_at: new Date((message?.date || Math.floor(Date.now() / 1000)) * 1000),
                        last_seen_at: new Date(),
                        payload: update
                    },
                    create: {
                        bot_id: bot.id,
                        chat_id: String(chat.id),
                        chat_type: chat.type,
                        username: chat.username || null,
                        first_name: chat.first_name || null,
                        last_name: chat.last_name || null,
                        started_at: new Date((message?.date || Math.floor(Date.now() / 1000)) * 1000),
                        last_seen_at: new Date(),
                        payload: update
                    }
                });
            }

            if (nextOffset !== bot.update_offset) {
                await prisma.telegramBot.update({
                    where: { id: bot.id },
                    data: {
                        update_offset: nextOffset
                    }
                });
            }
        } catch (error) {
            log('update sync failed', bot.name, error instanceof Error ? error.message : error);
        }
    }
};

const main = async () => {
    assertTelegramEncryptionConfigured();
    log('started');

    while (true) {
        await syncBotContacts();
        await processPendingJobs();
        await sleep(normalizePollingValue(POLL_INTERVAL_MS, 5000));
    }
};

main()
    .catch((error) => {
        console.error('[telegram-worker] fatal error', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
