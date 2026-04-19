import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import {
    buildDefaultTelegramEventSettings,
    getDefaultTelegramLowStockThreshold,
    normalizeTelegramEventSettings,
    normalizeTelegramLowStockThreshold,
    parseTelegramManualRecipients
} from '../services/telegramConfig.ts';
import { assertTelegramEncryptionConfigured, decryptTelegramBotToken, encryptTelegramBotToken } from '../services/telegramCrypto.ts';
import { validateTelegramBotToken } from '../services/telegramClient.ts';

const router = express.Router();
const prisma = new PrismaClient();

const serializeBot = (bot: {
    id: string;
    name: string;
    bot_username: string | null;
    notify_admin: boolean;
    notify_sales_manager: boolean;
    notify_franchisee: boolean;
    event_settings: unknown;
    manual_recipients: unknown;
    low_stock_threshold: number;
    created_at: Date;
    updated_at: Date;
    encrypted_token: string | null;
}) => ({
    id: bot.id,
    name: bot.name,
    bot_username: bot.bot_username,
    notify_admin: bot.notify_admin,
    notify_sales_manager: bot.notify_sales_manager,
    notify_franchisee: bot.notify_franchisee,
    event_settings: normalizeTelegramEventSettings(bot.event_settings),
    manual_recipients: parseTelegramManualRecipients(bot.manual_recipients).recipients,
    low_stock_threshold: bot.low_stock_threshold,
    has_token: Boolean(bot.encrypted_token),
    created_at: bot.created_at,
    updated_at: bot.updated_at
});

router.use(authenticateToken, requireRole(['ADMIN']));

router.get('/bots', async (_req, res) => {
    try {
        const bots = await prisma.telegramBot.findMany({
            orderBy: { created_at: 'asc' }
        });
        res.json(bots.map(serializeBot));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить Telegram-ботов.' });
    }
});

router.post('/bots', async (_req: AuthRequest, res) => {
    try {
        assertTelegramEncryptionConfigured();
        const count = await prisma.telegramBot.count();
        const bot = await prisma.telegramBot.create({
            data: {
                name: `Бот ${count + 1}`,
                event_settings: buildDefaultTelegramEventSettings(),
                manual_recipients: [],
                low_stock_threshold: getDefaultTelegramLowStockThreshold()
            }
        });
        res.status(201).json(serializeBot(bot));
    } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Не удалось создать Telegram-бота.';
        res.status(503).json({ error: message });
    }
});

router.put('/bots/:id', async (req, res) => {
    try {
        assertTelegramEncryptionConfigured();
        const existing = await prisma.telegramBot.findUnique({
            where: { id: req.params.id }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Telegram-бот не найден.' });
        }

        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        if (!name) {
            return res.status(400).json({ error: 'Укажите название Telegram-бота.' });
        }

        const manualRecipientsResult = parseTelegramManualRecipients(req.body?.manual_recipients);
        if (manualRecipientsResult.errors.length > 0) {
            return res.status(400).json({ error: manualRecipientsResult.errors[0] });
        }

        const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        let encryptedToken = existing.encrypted_token;
        let botUsername = existing.bot_username;
        if (token) {
            const validated = await validateTelegramBotToken(token);
            encryptedToken = encryptTelegramBotToken(token);
            botUsername = validated.username;
        }

        const updated = await prisma.telegramBot.update({
            where: { id: existing.id },
            data: {
                name,
                encrypted_token: encryptedToken,
                bot_username: botUsername,
                notify_admin: Boolean(req.body?.notify_admin),
                notify_sales_manager: Boolean(req.body?.notify_sales_manager),
                notify_franchisee: Boolean(req.body?.notify_franchisee),
                event_settings: normalizeTelegramEventSettings(req.body?.event_settings),
                manual_recipients: manualRecipientsResult.recipients,
                low_stock_threshold: normalizeTelegramLowStockThreshold(req.body?.low_stock_threshold)
            }
        });

        res.json(serializeBot(updated));
    } catch (error) {
        console.error(error);
        const statusCode = error instanceof Error && error.message.includes('TELEGRAM_TOKEN_ENCRYPTION_KEY') ? 503 : 400;
        const message = error instanceof Error ? error.message : 'Не удалось сохранить Telegram-бота.';
        res.status(statusCode).json({ error: message });
    }
});

router.delete('/bots/:id', async (req, res) => {
    try {
        const existing = await prisma.telegramBot.findUnique({
            where: { id: req.params.id },
            select: { id: true }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Telegram-бот не найден.' });
        }

        await prisma.telegramBot.delete({
            where: { id: existing.id }
        });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось удалить Telegram-бота.' });
    }
});

router.post('/bots/:id/validate', async (req, res) => {
    try {
        const existing = await prisma.telegramBot.findUnique({
            where: { id: req.params.id }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Telegram-бот не найден.' });
        }

        const inlineToken = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
        let token = inlineToken;
        if (!token) {
            assertTelegramEncryptionConfigured();
            if (!existing.encrypted_token) {
                return res.status(400).json({ error: 'У этого Telegram-бота еще не сохранен token.' });
            }
            token = decryptTelegramBotToken(existing.encrypted_token);
        }

        const result = await validateTelegramBotToken(token);
        res.json(result);
    } catch (error) {
        console.error(error);
        const statusCode = error instanceof Error && error.message.includes('TELEGRAM_TOKEN_ENCRYPTION_KEY') ? 503 : 400;
        const message = error instanceof Error ? error.message : 'Не удалось проверить Telegram token.';
        res.status(statusCode).json({ error: message });
    }
});

router.get('/bots/:id/recent-chats', async (req, res) => {
    try {
        const bot = await prisma.telegramBot.findUnique({
            where: { id: req.params.id },
            select: { id: true }
        });
        if (!bot) {
            return res.status(404).json({ error: 'Telegram-бот не найден.' });
        }

        const contacts = await prisma.telegramBotContact.findMany({
            where: {
                bot_id: bot.id
            },
            orderBy: [
                { last_seen_at: 'desc' },
                { created_at: 'desc' }
            ],
            take: 50
        });
        res.json(contacts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить недавние чаты.' });
    }
});

export default router;
