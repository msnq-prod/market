import express from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

type QrSide = 'left' | 'right';
type QrFieldKey = 'productName' | 'locationName' | 'coordinates' | 'collectionTime' | 'serialNumber' | 'customText';

type QrFieldConfig = {
    enabled: boolean;
    fontSizePx: number;
    fontWeight: number;
    fontFamily: string;
    spacingBeforeMm: number;
    spacingAfterMm: number;
};

type QrPrintSettings = {
    labelWidthMm: number;
    labelHeightMm: number;
    labelRadiusMm: number;
    labelPaddingTopMm: number;
    labelPaddingRightMm: number;
    labelPaddingBottomMm: number;
    labelPaddingLeftMm: number;
    qrSizeMm: number;
    pagePaddingMm: number;
    gapMm: number;
    invertColors: boolean;
    qrSide: QrSide;
    fieldOrder: QrFieldKey[];
    fields: Record<QrFieldKey, QrFieldConfig>;
};

const router = express.Router();
const prisma = new PrismaClient();

const FIELD_KEYS: QrFieldKey[] = [
    'productName',
    'locationName',
    'coordinates',
    'collectionTime',
    'serialNumber',
    'customText'
];

const FONT_OPTIONS = [
    'Arial, sans-serif',
    '"Trebuchet MS", sans-serif',
    '"Helvetica Neue", Arial, sans-serif',
    '"Times New Roman", serif',
    'Georgia, serif',
    '"Courier New", monospace',
    'Verdana, sans-serif'
];

const FONT_WEIGHT_OPTIONS = [400, 500, 600, 700];
const DEFAULT_LABEL_PADDING_MM = 3;
const DEFAULT_FIELD_SPACING_BEFORE_MM = 0;
const DEFAULT_FIELD_SPACING_AFTER_MM = 1.6;

const createDefaultSettings = (): QrPrintSettings => ({
    labelWidthMm: 58,
    labelHeightMm: 36,
    labelRadiusMm: 0,
    labelPaddingTopMm: DEFAULT_LABEL_PADDING_MM,
    labelPaddingRightMm: DEFAULT_LABEL_PADDING_MM,
    labelPaddingBottomMm: DEFAULT_LABEL_PADDING_MM,
    labelPaddingLeftMm: DEFAULT_LABEL_PADDING_MM,
    qrSizeMm: 18,
    pagePaddingMm: 8,
    gapMm: 4,
    invertColors: false,
    qrSide: 'right',
    fieldOrder: [...FIELD_KEYS],
    fields: {
        productName: {
            enabled: true,
            fontSizePx: 18,
            fontWeight: 700,
            fontFamily: FONT_OPTIONS[0],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        },
        locationName: {
            enabled: true,
            fontSizePx: 13,
            fontWeight: 600,
            fontFamily: FONT_OPTIONS[1],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        },
        coordinates: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 500,
            fontFamily: FONT_OPTIONS[5],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        },
        collectionTime: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 500,
            fontFamily: FONT_OPTIONS[2],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        },
        serialNumber: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 700,
            fontFamily: FONT_OPTIONS[5],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        },
        customText: {
            enabled: false,
            fontSizePx: 13,
            fontWeight: 600,
            fontFamily: FONT_OPTIONS[0],
            spacingBeforeMm: DEFAULT_FIELD_SPACING_BEFORE_MM,
            spacingAfterMm: DEFAULT_FIELD_SPACING_AFTER_MM
        }
    }
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const clampNumber = (value: unknown, minimum: number, maximum: number, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, parsed));
};

const sanitizePresetName = (value: unknown) => {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim().replace(/\s+/g, ' ').slice(0, 80);
};

const sanitizeQrPrintSettings = (value: unknown): QrPrintSettings | null => {
    if (!isRecord(value)) {
        return null;
    }

    const defaults = createDefaultSettings();
    const parsedFields = isRecord(value.fields) ? value.fields : {};
    const parsedOrder = Array.isArray(value.fieldOrder)
        ? value.fieldOrder.filter((fieldKey): fieldKey is QrFieldKey => FIELD_KEYS.includes(fieldKey as QrFieldKey))
        : [];

    return {
        labelWidthMm: clampNumber(value.labelWidthMm, 30, 140, defaults.labelWidthMm),
        labelHeightMm: clampNumber(value.labelHeightMm, 20, 120, defaults.labelHeightMm),
        labelRadiusMm: clampNumber(value.labelRadiusMm, 0, 16, defaults.labelRadiusMm),
        labelPaddingTopMm: clampNumber(value.labelPaddingTopMm, 0, 20, defaults.labelPaddingTopMm),
        labelPaddingRightMm: clampNumber(value.labelPaddingRightMm, 0, 20, defaults.labelPaddingRightMm),
        labelPaddingBottomMm: clampNumber(value.labelPaddingBottomMm, 0, 20, defaults.labelPaddingBottomMm),
        labelPaddingLeftMm: clampNumber(value.labelPaddingLeftMm, 0, 20, defaults.labelPaddingLeftMm),
        qrSizeMm: clampNumber(value.qrSizeMm, 10, 60, defaults.qrSizeMm),
        pagePaddingMm: clampNumber(value.pagePaddingMm, 4, 20, defaults.pagePaddingMm),
        gapMm: clampNumber(value.gapMm, 2, 20, defaults.gapMm),
        invertColors: typeof value.invertColors === 'boolean' ? value.invertColors : defaults.invertColors,
        qrSide: value.qrSide === 'left' ? 'left' : defaults.qrSide,
        fieldOrder: [...new Set([...parsedOrder, ...FIELD_KEYS])] as QrFieldKey[],
        fields: FIELD_KEYS.reduce((acc, fieldKey) => {
            const source = isRecord(parsedFields[fieldKey]) ? parsedFields[fieldKey] : {};
            acc[fieldKey] = {
                enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.fields[fieldKey].enabled,
                fontSizePx: clampNumber(source.fontSizePx, 9, 40, defaults.fields[fieldKey].fontSizePx),
                fontWeight: FONT_WEIGHT_OPTIONS.includes(Number(source.fontWeight))
                    ? Number(source.fontWeight)
                    : defaults.fields[fieldKey].fontWeight,
                fontFamily: FONT_OPTIONS.includes(String(source.fontFamily))
                    ? String(source.fontFamily)
                    : defaults.fields[fieldKey].fontFamily,
                spacingBeforeMm: clampNumber(source.spacingBeforeMm, 0, 20, defaults.fields[fieldKey].spacingBeforeMm),
                spacingAfterMm: clampNumber(source.spacingAfterMm, 0, 20, defaults.fields[fieldKey].spacingAfterMm)
            };
            return acc;
        }, {} as Record<QrFieldKey, QrFieldConfig>)
    };
};

const serializePreset = (preset: {
    id: string;
    name: string;
    settings: unknown;
    created_by_user_id: string;
    updated_by_user_id: string | null;
    created_at: Date;
    updated_at: Date;
}) => ({
    id: preset.id,
    name: preset.name,
    settings: sanitizeQrPrintSettings(preset.settings) || createDefaultSettings(),
    created_by_user_id: preset.created_by_user_id,
    updated_by_user_id: preset.updated_by_user_id,
    created_at: preset.created_at,
    updated_at: preset.updated_at
});

const findDuplicatePreset = (name: string, excludeId?: string) => prisma.qrPrintPreset.findFirst({
    where: {
        name,
        deleted_at: null,
        ...(excludeId ? { id: { not: excludeId } } : {})
    },
    select: { id: true }
});

router.use(authenticateToken, requireRole(['ADMIN', 'MANAGER']));

router.get('/', async (_req, res) => {
    try {
        const presets = await prisma.qrPrintPreset.findMany({
            where: { deleted_at: null },
            orderBy: { updated_at: 'desc' }
        });
        res.json(presets.map(serializePreset));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить пресеты QR-печати.' });
    }
});

router.post('/', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const name = sanitizePresetName(req.body?.name);
        if (!name) {
            return res.status(400).json({ error: 'Укажите название пресета.' });
        }

        const settings = sanitizeQrPrintSettings(req.body?.settings);
        if (!settings) {
            return res.status(400).json({ error: 'Передайте корректные настройки QR-печати.' });
        }

        const duplicate = await findDuplicatePreset(name);
        if (duplicate) {
            return res.status(409).json({ error: 'Пресет с таким названием уже существует.' });
        }

        const preset = await prisma.qrPrintPreset.create({
            data: {
                name,
                settings: settings as unknown as Prisma.InputJsonValue,
                created_by_user_id: req.user.id,
                updated_by_user_id: req.user.id
            }
        });

        res.status(201).json(serializePreset(preset));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сохранить пресет QR-печати.' });
    }
});

router.put('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const existing = await prisma.qrPrintPreset.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Пресет QR-печати не найден.' });
        }

        const name = sanitizePresetName(req.body?.name);
        if (!name) {
            return res.status(400).json({ error: 'Укажите название пресета.' });
        }

        const settings = sanitizeQrPrintSettings(req.body?.settings);
        if (!settings) {
            return res.status(400).json({ error: 'Передайте корректные настройки QR-печати.' });
        }

        const duplicate = await findDuplicatePreset(name, existing.id);
        if (duplicate) {
            return res.status(409).json({ error: 'Пресет с таким названием уже существует.' });
        }

        const preset = await prisma.qrPrintPreset.update({
            where: { id: existing.id },
            data: {
                name,
                settings: settings as unknown as Prisma.InputJsonValue,
                updated_by_user_id: req.user.id
            }
        });

        res.json(serializePreset(preset));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось обновить пресет QR-печати.' });
    }
});

router.delete('/:id', async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);

        const existing = await prisma.qrPrintPreset.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            }
        });
        if (!existing) {
            return res.status(404).json({ error: 'Пресет QR-печати не найден.' });
        }

        await prisma.qrPrintPreset.update({
            where: { id: existing.id },
            data: {
                deleted_at: new Date(),
                updated_by_user_id: req.user.id
            }
        });

        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось удалить пресет QR-печати.' });
    }
});

export default router;
