import crypto from 'node:crypto';

const ENCRYPTION_SCHEME = 'aes-256-gcm';
const PART_SEPARATOR = '.';

const buildTelegramEncryptionKey = (): Buffer => {
    const rawKey = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY?.trim();
    if (!rawKey) {
        throw new Error('Не задан TELEGRAM_TOKEN_ENCRYPTION_KEY. Сохранение Telegram-ботов недоступно.');
    }

    return crypto.createHash('sha256').update(rawKey).digest();
};

export const encryptTelegramBotToken = (token: string): string => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
        throw new Error('Пустой Telegram token нельзя зашифровать.');
    }

    const key = buildTelegramEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ENCRYPTION_SCHEME, key, iv);
    const encrypted = Buffer.concat([cipher.update(trimmedToken, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
        iv.toString('base64url'),
        authTag.toString('base64url'),
        encrypted.toString('base64url')
    ].join(PART_SEPARATOR);
};

export const decryptTelegramBotToken = (encryptedToken: string): string => {
    const [ivPart, authTagPart, payloadPart] = encryptedToken.split(PART_SEPARATOR);
    if (!ivPart || !authTagPart || !payloadPart) {
        throw new Error('Некорректный формат зашифрованного Telegram token.');
    }

    const key = buildTelegramEncryptionKey();
    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(authTagPart, 'base64url');
    const payload = Buffer.from(payloadPart, 'base64url');
    const decipher = crypto.createDecipheriv(ENCRYPTION_SCHEME, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);

    return decrypted.toString('utf8');
};

export const assertTelegramEncryptionConfigured = () => {
    void buildTelegramEncryptionKey();
};
