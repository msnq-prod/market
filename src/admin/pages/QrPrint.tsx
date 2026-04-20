import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Download, GripVertical, MoveHorizontal, QrCode, RotateCcw, X } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type Translation = {
    language_id: number;
    name: string;
    description?: string;
    country?: string;
};

type ProductBatchSummary = {
    id: string;
    status: string;
    created_at: string;
    items_count: number;
};

type ProductSummary = {
    id: string;
    translations: Translation[];
    location?: {
        id: string;
        lat: number;
        lng: number;
        translations: Translation[];
    } | null;
    batches: ProductBatchSummary[];
};

type QrPackProduct = {
    id: string;
    translations: Translation[];
    location?: {
        id: string;
        lat: number;
        lng: number;
        translations: Translation[];
    } | null;
} | null;

type QrPackItem = {
    id: string;
    temp_id: string;
    serial_number: string | null;
    status: string;
    collected_date: string | null;
    collected_time: string | null;
    qr_url: string | null;
};

type QrPackBatch = {
    id: string;
    status: string;
    created_at: string;
    collected_date: string | null;
    collected_time: string | null;
    gps_lat: number | null;
    gps_lng: number | null;
};

type QrPackResponse = {
    batch: QrPackBatch;
    product: QrPackProduct;
    items: QrPackItem[];
};

type SelectionMode = 'all' | 'selected';
type QrSide = 'left' | 'right';
type QrFieldKey = 'productName' | 'locationName' | 'coordinates' | 'collectionTime' | 'serialNumber' | 'customText';

export type QrFieldConfig = {
    enabled: boolean;
    fontSizePx: number;
    fontWeight: number;
    fontFamily: string;
};

export type QrPrintSettings = {
    labelWidthMm: number;
    labelHeightMm: number;
    labelRadiusMm: number;
    qrSizeMm: number;
    pagePaddingMm: number;
    gapMm: number;
    invertColors: boolean;
    qrSide: QrSide;
    fieldOrder: QrFieldKey[];
    fields: Record<QrFieldKey, QrFieldConfig>;
};

export type QrDocumentItem = {
    id: string;
    itemId: string;
    tempId: string;
    serialNumber: string;
    qrUrl: string;
    productName: string;
    locationName: string;
    coordinates: string;
    collectionTime: string;
    customText: string;
};

export type QrPrintDraft = {
    version: 1;
    batchId: string;
    mode: SelectionMode;
    selectedItemIds: string[];
    customFieldValues: Record<string, string>;
};

const QR_PRINT_LAYOUT_KEY = 'qr-print-layout:v1';
const QR_PRINT_DRAFT_VERSION = 1;
const QR_BLOCK_ID = 'qr-block';
const QR_SLOT_LEFT_ID = 'qr-slot-left';
const QR_SLOT_RIGHT_ID = 'qr-slot-right';
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX = 96 / 25.4;
const A4_WIDTH_PX = A4_WIDTH_MM * MM_TO_PX;
const A4_HEIGHT_PX = A4_HEIGHT_MM * MM_TO_PX;
const A4_ASPECT_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM;
const LABEL_PADDING_MM = 3;
const LABEL_CONTENT_GAP_MM = 3;
const PDF_EXPORT_SCALE = 2;
const PDF_GEOMETRY_TOLERANCE_PX = 2;

const FIELD_KEYS: QrFieldKey[] = [
    'productName',
    'locationName',
    'coordinates',
    'collectionTime',
    'serialNumber',
    'customText'
];

const FIELD_LABELS: Record<QrFieldKey, string> = {
    productName: 'Название',
    locationName: 'Локация',
    coordinates: 'Координаты',
    collectionTime: 'Время',
    serialNumber: 'Серийный номер',
    customText: 'Свое поле'
};

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
const QR_CONTROL_CLASS = 'w-full rounded-xl border border-white/8 bg-[#11141a] text-sm text-gray-100 outline-none transition focus:border-blue-300/60';

const createDefaultSettings = (): QrPrintSettings => ({
    labelWidthMm: 58,
    labelHeightMm: 36,
    labelRadiusMm: 0,
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
            fontFamily: FONT_OPTIONS[0]
        },
        locationName: {
            enabled: true,
            fontSizePx: 13,
            fontWeight: 600,
            fontFamily: FONT_OPTIONS[1]
        },
        coordinates: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 500,
            fontFamily: FONT_OPTIONS[5]
        },
        collectionTime: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 500,
            fontFamily: FONT_OPTIONS[2]
        },
        serialNumber: {
            enabled: true,
            fontSizePx: 12,
            fontWeight: 700,
            fontFamily: FONT_OPTIONS[5]
        },
        customText: {
            enabled: false,
            fontSizePx: 13,
            fontWeight: 600,
            fontFamily: FONT_OPTIONS[0]
        }
    }
});

const clampNumber = (value: unknown, minimum: number, maximum: number, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, parsed));
};

const getDefaultTranslationValue = <T extends { language_id: number }>(translations: T[] | undefined, field: keyof T) => {
    if (!translations?.length) {
        return '';
    }

    const translation = translations.find((item) => item.language_id === 2)
        || translations.find((item) => item.language_id === 1)
        || translations[0];
    const value = translation?.[field];
    return typeof value === 'string' ? value : '';
};

const createDraftKey = (batchId: string) => `qr-print-draft:${batchId}`;

const parseLayoutSettings = (raw: string | null): QrPrintSettings => {
    const defaults = createDefaultSettings();

    if (!raw) {
        return defaults;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<QrPrintSettings>;
        const parsedFields = (parsed.fields || {}) as Partial<Record<QrFieldKey, Partial<QrFieldConfig>>>;
        const parsedOrder = Array.isArray(parsed.fieldOrder)
            ? parsed.fieldOrder.filter((value): value is QrFieldKey => FIELD_KEYS.includes(value as QrFieldKey))
            : [];

        return {
            labelWidthMm: clampNumber(parsed.labelWidthMm, 30, 140, defaults.labelWidthMm),
            labelHeightMm: clampNumber(parsed.labelHeightMm, 20, 120, defaults.labelHeightMm),
            labelRadiusMm: clampNumber(parsed.labelRadiusMm, 0, 16, defaults.labelRadiusMm),
            qrSizeMm: clampNumber(parsed.qrSizeMm, 10, 60, defaults.qrSizeMm),
            pagePaddingMm: clampNumber(parsed.pagePaddingMm, 4, 20, defaults.pagePaddingMm),
            gapMm: clampNumber(parsed.gapMm, 2, 20, defaults.gapMm),
            invertColors: typeof parsed.invertColors === 'boolean' ? parsed.invertColors : defaults.invertColors,
            qrSide: parsed.qrSide === 'left' ? 'left' : defaults.qrSide,
            fieldOrder: [...new Set([...parsedOrder, ...FIELD_KEYS])] as QrFieldKey[],
            fields: FIELD_KEYS.reduce((acc, key) => {
                const source = parsedFields[key] || {};
                acc[key] = {
                    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.fields[key].enabled,
                    fontSizePx: clampNumber(source.fontSizePx, 9, 40, defaults.fields[key].fontSizePx),
                    fontWeight: FONT_WEIGHT_OPTIONS.includes(Number(source.fontWeight))
                        ? Number(source.fontWeight)
                        : defaults.fields[key].fontWeight,
                    fontFamily: FONT_OPTIONS.includes(String(source.fontFamily))
                        ? String(source.fontFamily)
                        : defaults.fields[key].fontFamily
                };
                return acc;
            }, {} as Record<QrFieldKey, QrFieldConfig>)
        };
    } catch {
        return defaults;
    }
};

const readDraft = (batchId: string): QrPrintDraft | null => {
    if (!batchId || typeof window === 'undefined') {
        return null;
    }

    const raw = window.localStorage.getItem(createDraftKey(batchId));
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw) as Partial<QrPrintDraft>;
        if (parsed.version !== QR_PRINT_DRAFT_VERSION || parsed.batchId !== batchId) {
            return null;
        }

        return {
            version: QR_PRINT_DRAFT_VERSION,
            batchId,
            mode: parsed.mode === 'selected' ? 'selected' : 'all',
            selectedItemIds: Array.isArray(parsed.selectedItemIds)
                ? parsed.selectedItemIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                : [],
            customFieldValues: Object.entries(parsed.customFieldValues || {}).reduce((acc, [key, value]) => {
                if (typeof value === 'string' && key.trim()) {
                    acc[key] = value;
                }
                return acc;
            }, {} as Record<string, string>)
        };
    } catch {
        return null;
    }
};

const formatDateOnly = (value: string | null) => {
    if (!value) {
        return '';
    }

    const isoDate = value.slice(0, 10);
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) {
        return '';
    }

    return `${day}.${month}.${year}`;
};

const formatCoordinates = (latitude: number | null, longitude: number | null) => {
    if (latitude == null || longitude == null) {
        return '';
    }

    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
};

const formatCollectionTime = (
    itemCollectedDate: string | null,
    itemCollectedTime: string | null,
    batchCollectedDate: string | null,
    batchCollectedTime: string | null
) => {
    const date = formatDateOnly(itemCollectedDate || batchCollectedDate);
    const time = itemCollectedTime || batchCollectedTime || '';

    if (date && time) {
        return `${date} · ${time}`;
    }
    if (date) {
        return date;
    }
    return time;
};

const getFieldValue = (item: QrDocumentItem, key: QrFieldKey) => {
    switch (key) {
        case 'productName':
            return item.productName;
        case 'locationName':
            return item.locationName;
        case 'coordinates':
            return item.coordinates;
        case 'collectionTime':
            return item.collectionTime;
        case 'serialNumber':
            return item.serialNumber;
        case 'customText':
            return item.customText;
        default:
            return '';
    }
};

const buildDocumentItem = (pack: QrPackResponse, item: QrPackItem, customText: string): QrDocumentItem => ({
    id: item.id,
    itemId: item.id,
    tempId: item.temp_id,
    serialNumber: item.serial_number || 'Серийный номер не указан',
    qrUrl: item.qr_url || '',
    productName: getDefaultTranslationValue(pack.product?.translations, 'name') || 'Без названия',
    locationName: getDefaultTranslationValue(pack.product?.location?.translations, 'name'),
    coordinates: formatCoordinates(pack.batch.gps_lat, pack.batch.gps_lng),
    collectionTime: formatCollectionTime(
        item.collected_date,
        item.collected_time,
        pack.batch.collected_date,
        pack.batch.collected_time
    ),
    customText
});

const buildPreviewFallback = (pack: QrPackResponse | null, product: ProductSummary | null, customTextEnabled: boolean): QrDocumentItem => ({
    id: 'preview',
    itemId: 'preview',
    tempId: '001',
    serialNumber: pack?.items[0]?.serial_number || 'SN-00000001',
    qrUrl: pack?.items[0]?.qr_url || '',
    productName: getDefaultTranslationValue(pack?.product?.translations || product?.translations, 'name') || 'Название товара',
    locationName: getDefaultTranslationValue(pack?.product?.location?.translations || product?.location?.translations, 'name') || 'Название локации',
    coordinates: formatCoordinates(pack?.batch.gps_lat ?? product?.location?.lat ?? null, pack?.batch.gps_lng ?? product?.location?.lng ?? null) || '55.7500, 37.6100',
    collectionTime: formatCollectionTime(
        pack?.items[0]?.collected_date || null,
        pack?.items[0]?.collected_time || null,
        pack?.batch.collected_date || null,
        pack?.batch.collected_time || null
    ) || '10.04.2026 · 13:45',
    customText: customTextEnabled ? 'Любой ваш текст' : ''
});

const splitIntoPages = <T,>(items: T[], size: number) => {
    if (size <= 0) {
        return [items];
    }

    const pages: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        pages.push(items.slice(index, index + size));
    }
    return pages;
};

const getFieldStyle = (config: QrFieldConfig): CSSProperties => ({
    fontSize: `${config.fontSizePx}px`,
    fontWeight: config.fontWeight,
    fontFamily: config.fontFamily,
    lineHeight: 1.2
});

const buildPageGridStyle = (settings: QrPrintSettings, cardsPerRow: number): CSSProperties => ({
    padding: `${settings.pagePaddingMm}mm`,
    gap: `${settings.gapMm}mm`,
    gridTemplateColumns: `repeat(${cardsPerRow}, ${settings.labelWidthMm}mm)`,
    gridAutoRows: `${settings.labelHeightMm}mm`,
    alignContent: 'start'
});

const formatMmValue = (value: number) => {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const formatCssMm = (value: number) => `${formatMmValue(value)}mm`;

const sanitizePdfFilenamePart = (value: string) => (
    value
        .trim()
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
);

const buildPdfFilename = (batchId: string | null) => {
    const safeBatchId = sanitizePdfFilenamePart(batchId || '') || 'document';
    return `qr-${safeBatchId}.pdf`;
};

const setElementStyles = (element: HTMLElement, styles: Record<string, string>) => {
    Object.entries(styles).forEach(([property, value]) => {
        element.style.setProperty(property, value);
    });
};

const applyPdfFieldStyle = (element: HTMLElement, config: QrFieldConfig) => {
    setElementStyles(element, {
        'font-size': `${config.fontSizePx}px`,
        'font-weight': String(config.fontWeight),
        'font-family': config.fontFamily,
        'line-height': '1.2',
        'overflow-wrap': 'break-word',
        'word-break': 'break-word',
        margin: '0'
    });
};

const resolveExportImageUrl = (url: string) => {
    try {
        return new URL(url, window.location.origin).toString();
    } catch {
        return url;
    }
};

const validatePdfSettings = (settings: QrPrintSettings, cardsPerRow: number, rowsPerPage: number) => {
    const errors: string[] = [];
    const contentWidthMm = A4_WIDTH_MM - settings.pagePaddingMm * 2;
    const contentHeightMm = A4_HEIGHT_MM - settings.pagePaddingMm * 2;
    const usedWidthMm = cardsPerRow * settings.labelWidthMm + Math.max(0, cardsPerRow - 1) * settings.gapMm;
    const usedHeightMm = rowsPerPage * settings.labelHeightMm + Math.max(0, rowsPerPage - 1) * settings.gapMm;
    const labelInnerWidthMm = settings.labelWidthMm - LABEL_PADDING_MM * 2;
    const labelInnerHeightMm = settings.labelHeightMm - LABEL_PADDING_MM * 2;
    const maxRadiusMm = Math.min(settings.labelWidthMm, settings.labelHeightMm) / 2;

    if (usedWidthMm - contentWidthMm > 0.01) {
        errors.push(`Ширина ряда ${formatMmValue(usedWidthMm)} мм больше доступной области A4 ${formatMmValue(contentWidthMm)} мм.`);
    }

    if (usedHeightMm - contentHeightMm > 0.01) {
        errors.push(`Высота ряда ${formatMmValue(usedHeightMm)} мм больше доступной области A4 ${formatMmValue(contentHeightMm)} мм.`);
    }

    if (settings.qrSizeMm - labelInnerWidthMm > 0.01 || settings.qrSizeMm - labelInnerHeightMm > 0.01) {
        errors.push(`QR ${formatMmValue(settings.qrSizeMm)} мм не помещается во внутреннюю область этикетки ${formatMmValue(labelInnerWidthMm)} × ${formatMmValue(labelInnerHeightMm)} мм.`);
    }

    if (settings.labelRadiusMm - maxRadiusMm > 0.01) {
        errors.push(`Скругление ${formatMmValue(settings.labelRadiusMm)} мм больше половины размера этикетки ${formatMmValue(maxRadiusMm)} мм.`);
    }

    return errors;
};

const createPdfExportRoot = ({
    pages,
    settings,
    cardsPerRow
}: {
    pages: QrDocumentItem[][];
    settings: QrPrintSettings;
    cardsPerRow: number;
}) => {
    const root = document.createElement('div');
    setElementStyles(root, {
        position: 'absolute',
        left: '-10000px',
        top: '0',
        width: `${A4_WIDTH_MM}mm`,
        background: '#ffffff',
        color: '#0f172a',
        'font-family': 'Arial, sans-serif',
        'z-index': '-1'
    });

    pages.forEach((pageItems) => {
        const pageElement = document.createElement('article');
        pageElement.dataset.qrPdfPage = 'true';
        setElementStyles(pageElement, {
            width: `${A4_WIDTH_MM}mm`,
            height: `${A4_HEIGHT_MM}mm`,
            background: '#ffffff',
            overflow: 'hidden',
            margin: '0',
            padding: '0',
            'box-sizing': 'border-box'
        });

        const gridElement = document.createElement('div');
        setElementStyles(gridElement, {
            display: 'grid',
            padding: `${settings.pagePaddingMm}mm`,
            gap: `${settings.gapMm}mm`,
            'grid-template-columns': `repeat(${cardsPerRow}, ${settings.labelWidthMm}mm)`,
            'grid-auto-rows': `${settings.labelHeightMm}mm`,
            'align-content': 'start',
            'box-sizing': 'border-box'
        });

        pageItems.forEach((item) => {
            gridElement.appendChild(createPdfLabelElement(item, settings));
        });

        pageElement.appendChild(gridElement);
        root.appendChild(pageElement);
    });

    return root;
};

const createPdfLabelElement = (item: QrDocumentItem, settings: QrPrintSettings) => {
    const isInverted = settings.invertColors;
    const labelElement = document.createElement('article');
    labelElement.dataset.qrLabelCard = 'true';
    setElementStyles(labelElement, {
        display: 'flex',
        'flex-direction': settings.qrSide === 'left' ? 'row' : 'row-reverse',
        width: `${settings.labelWidthMm}mm`,
        height: `${settings.labelHeightMm}mm`,
        padding: `${LABEL_PADDING_MM}mm`,
        gap: `${LABEL_CONTENT_GAP_MM}mm`,
        overflow: 'hidden',
        border: `1px solid ${isInverted ? '#334155' : '#e2e8f0'}`,
        background: isInverted ? '#020617' : '#ffffff',
        color: isInverted ? '#ffffff' : '#0f172a',
        'border-radius': formatCssMm(settings.labelRadiusMm),
        'box-sizing': 'border-box'
    });

    const qrElement = document.createElement('div');
    qrElement.dataset.qrPdfCode = 'true';
    setElementStyles(qrElement, {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        width: `${settings.qrSizeMm}mm`,
        height: `${settings.qrSizeMm}mm`,
        'flex-shrink': '0',
        border: `1px solid ${isInverted ? '#334155' : '#e2e8f0'}`,
        background: isInverted ? '#020617' : '#ffffff',
        'border-radius': formatCssMm(Math.min(settings.labelRadiusMm, 3)),
        'box-sizing': 'border-box',
        overflow: 'hidden'
    });

    if (item.qrUrl) {
        const qrImage = document.createElement('img');
        qrImage.src = resolveExportImageUrl(item.qrUrl);
        qrImage.alt = `QR ${item.serialNumber}`;
        setElementStyles(qrImage, {
            display: 'block',
            width: '100%',
            height: '100%',
            'object-fit': 'contain',
            filter: isInverted ? 'invert(1)' : 'none'
        });
        qrElement.appendChild(qrImage);
    }

    const textContainer = document.createElement('div');
    setElementStyles(textContainer, {
        display: 'flex',
        'min-width': '0',
        flex: '1',
        height: '100%',
        overflow: 'hidden',
        'align-items': 'center',
        'box-sizing': 'border-box'
    });

    const textStack = document.createElement('div');
    setElementStyles(textStack, {
        display: 'flex',
        width: '100%',
        height: '100%',
        'flex-direction': 'column',
        'justify-content': 'center',
        gap: '1.6mm',
        overflow: 'hidden'
    });

    settings.fieldOrder.forEach((fieldKey) => {
        const fieldConfig = settings.fields[fieldKey];
        if (!fieldConfig.enabled) {
            return;
        }

        const value = getFieldValue(item, fieldKey);
        if (!value.trim()) {
            return;
        }

        const fieldElement = document.createElement('p');
        fieldElement.textContent = value;
        applyPdfFieldStyle(fieldElement, fieldConfig);
        textStack.appendChild(fieldElement);
    });

    textContainer.appendChild(textStack);
    labelElement.appendChild(qrElement);
    labelElement.appendChild(textContainer);

    return labelElement;
};

const waitForExportImages = async (root: HTMLElement) => {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map((image) => {
        if (image.complete && image.naturalWidth > 0) {
            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => reject(new Error(`Не удалось загрузить QR ${image.alt || image.src}.`)), { once: true });
        });
    }));
};

const validateExportDomGeometry = (
    root: HTMLElement,
    settings: QrPrintSettings,
    expectedPageCount: number,
    expectedLabelCount: number
) => {
    const errors: string[] = [];
    const assertDimension = (label: string, actualPx: number, expectedMm: number) => {
        const expectedPx = expectedMm * MM_TO_PX;
        if (Math.abs(actualPx - expectedPx) > PDF_GEOMETRY_TOLERANCE_PX) {
            errors.push(`${label}: ожидается ${formatMmValue(expectedMm)} мм, фактически ${formatMmValue(actualPx / MM_TO_PX)} мм.`);
        }
    };

    const pageElements = Array.from(root.querySelectorAll<HTMLElement>('[data-qr-pdf-page="true"]'));
    if (pageElements.length !== expectedPageCount) {
        errors.push(`Количество страниц PDF изменилось: ожидается ${expectedPageCount}, фактически ${pageElements.length}.`);
    }

    pageElements.forEach((pageElement, index) => {
        const rect = pageElement.getBoundingClientRect();
        assertDimension(`Страница ${index + 1}, ширина`, rect.width, A4_WIDTH_MM);
        assertDimension(`Страница ${index + 1}, высота`, rect.height, A4_HEIGHT_MM);
    });

    const labelElements = Array.from(root.querySelectorAll<HTMLElement>('[data-qr-label-card="true"]'));
    if (labelElements.length !== expectedLabelCount) {
        errors.push(`Количество этикеток PDF изменилось: ожидается ${expectedLabelCount}, фактически ${labelElements.length}.`);
    }

    labelElements.forEach((labelElement, index) => {
        const rect = labelElement.getBoundingClientRect();
        assertDimension(`Этикетка ${index + 1}, ширина`, rect.width, settings.labelWidthMm);
        assertDimension(`Этикетка ${index + 1}, высота`, rect.height, settings.labelHeightMm);
    });

    const qrElements = Array.from(root.querySelectorAll<HTMLElement>('[data-qr-pdf-code="true"]'));
    qrElements.forEach((qrElement, index) => {
        const rect = qrElement.getBoundingClientRect();
        assertDimension(`QR ${index + 1}, ширина`, rect.width, settings.qrSizeMm);
        assertDimension(`QR ${index + 1}, высота`, rect.height, settings.qrSizeMm);
    });

    return errors;
};

export function QrPrint() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialRequestRef = useRef<{
        batchId: string;
        mode: SelectionMode;
        ids: string[];
    }>({
        batchId: searchParams.get('batchId')?.trim() || '',
        mode: searchParams.get('mode') === 'selected' ? 'selected' : 'all',
        ids: (searchParams.get('ids') || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
    });

    const [products, setProducts] = useState<ProductSummary[]>([]);
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState('');

    const [activeProductId, setActiveProductId] = useState('');
    const [activeBatchId, setActiveBatchId] = useState(initialRequestRef.current.batchId);

    const [pack, setPack] = useState<QrPackResponse | null>(null);
    const [packLoading, setPackLoading] = useState(Boolean(initialRequestRef.current.batchId));
    const [packError, setPackError] = useState('');

    const [selectionMode, setSelectionMode] = useState<SelectionMode>(initialRequestRef.current.mode);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
    const [settings, setSettings] = useState<QrPrintSettings>(() => (
        typeof window === 'undefined'
            ? createDefaultSettings()
            : parseLayoutSettings(window.localStorage.getItem(QR_PRINT_LAYOUT_KEY))
    ));
    const [hydratedBatchId, setHydratedBatchId] = useState('');
    const [pdfExporting, setPdfExporting] = useState(false);
    const documentViewportRef = useRef<HTMLDivElement | null>(null);
    const [pagePreviewMetrics, setPagePreviewMetrics] = useState(() => ({
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX,
        scale: 1
    }));

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const productsWithBatches = useMemo(
        () => products.filter((product) => product.batches.length > 0),
        [products]
    );
    const selectedProduct = useMemo(
        () => productsWithBatches.find((product) => product.id === activeProductId) || null,
        [productsWithBatches, activeProductId]
    );

    const itemLookup = useMemo(
        () => new Map((pack?.items || []).map((item) => [item.id, item])),
        [pack]
    );

    const documentItems = useMemo(() => {
        if (!pack) {
            return [];
        }

        const orderedItems = selectionMode === 'all'
            ? pack.items
            : selectedItemIds
                .map((itemId) => itemLookup.get(itemId))
                .filter((item): item is QrPackItem => Boolean(item));

        return orderedItems.map((item) => buildDocumentItem(pack, item, customFieldValues[item.id] || ''));
    }, [customFieldValues, itemLookup, pack, selectedItemIds, selectionMode]);

    const previewItem = useMemo(
        () => documentItems[0] || buildPreviewFallback(pack, selectedProduct, settings.fields.customText.enabled),
        [documentItems, pack, selectedProduct, settings.fields.customText.enabled]
    );

    const hasDraftChanges = activeBatchId.length > 0
        && (selectionMode === 'selected' || Object.values(customFieldValues).some((value) => value.trim().length > 0));

    const visibleFieldOrder = useMemo(
        () => settings.fieldOrder.filter((fieldKey) => settings.fields[fieldKey].enabled),
        [settings.fieldOrder, settings.fields]
    );

    const cardsPerRow = Math.max(
        1,
        Math.floor(((A4_WIDTH_MM - settings.pagePaddingMm * 2) + settings.gapMm) / (settings.labelWidthMm + settings.gapMm))
    );
    const rowsPerPage = Math.max(
        1,
        Math.floor(((A4_HEIGHT_MM - settings.pagePaddingMm * 2) + settings.gapMm) / (settings.labelHeightMm + settings.gapMm))
    );
    const cardsPerPage = Math.max(1, cardsPerRow * rowsPerPage);
    const pages = useMemo(() => splitIntoPages(documentItems, cardsPerPage), [cardsPerPage, documentItems]);

    useEffect(() => {
        let cancelled = false;

        const loadProducts = async () => {
            setProductsLoading(true);
            setProductsError('');

            try {
                const response = await authFetch('/api/products');
                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить товары для QR-документа.' }));

                if (!response.ok) {
                    throw new Error(payload.error || 'Не удалось загрузить товары для QR-документа.');
                }

                if (!cancelled) {
                    setProducts(payload as ProductSummary[]);
                }
            } catch (error) {
                if (!cancelled) {
                    setProductsError(error instanceof Error ? error.message : 'Не удалось загрузить товары для QR-документа.');
                }
            } finally {
                if (!cancelled) {
                    setProductsLoading(false);
                }
            }
        };

        void loadProducts();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!activeBatchId || productsWithBatches.length === 0) {
            return;
        }

        const ownerProduct = productsWithBatches.find((product) => product.batches.some((batch) => batch.id === activeBatchId));
        if (ownerProduct && ownerProduct.id !== activeProductId) {
            setActiveProductId(ownerProduct.id);
        }
    }, [activeBatchId, activeProductId, productsWithBatches]);

    useEffect(() => {
        if (!activeBatchId) {
            setPack(null);
            setPackError('');
            setPackLoading(false);
            return;
        }

        let cancelled = false;

        const loadPack = async () => {
            setPackLoading(true);
            setPackError('');

            try {
                const response = await authFetch(`/api/batches/${activeBatchId}/qr-pack`);

                if (response.status === 403) {
                    throw new Error('Нет прав доступа к выбранной партии.');
                }
                if (response.status === 404) {
                    throw new Error('Партия не найдена.');
                }

                const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить QR-пакет.' }));

                if (!response.ok) {
                    throw new Error(payload.error || 'Не удалось загрузить QR-пакет.');
                }

                if (!cancelled) {
                    setPack(payload as QrPackResponse);
                }
            } catch (error) {
                if (!cancelled) {
                    setPack(null);
                    setPackError(error instanceof Error ? error.message : 'Не удалось загрузить QR-пакет.');
                }
            } finally {
                if (!cancelled) {
                    setPackLoading(false);
                }
            }
        };

        void loadPack();

        return () => {
            cancelled = true;
        };
    }, [activeBatchId]);

    useEffect(() => {
        if (!pack || hydratedBatchId === pack.batch.id) {
            return;
        }

        const availableIds = new Set(pack.items.map((item) => item.id));
        const initialRequest = initialRequestRef.current;
        const initialRequestTargetsCurrentBatch = initialRequest.batchId === pack.batch.id;

        let nextMode: SelectionMode = 'all';
        let nextSelectedItemIds: string[] = [];
        let nextCustomFieldValues: Record<string, string> = {};

        if (initialRequestTargetsCurrentBatch) {
            nextMode = initialRequest.mode;
            nextSelectedItemIds = initialRequest.ids.filter((itemId) => availableIds.has(itemId));
        } else {
            const draft = readDraft(pack.batch.id);
            if (draft) {
                nextMode = draft.mode;
                nextSelectedItemIds = draft.selectedItemIds.filter((itemId) => availableIds.has(itemId));
                nextCustomFieldValues = Object.entries(draft.customFieldValues).reduce((acc, [key, value]) => {
                    if (availableIds.has(key)) {
                        acc[key] = value;
                    }
                    return acc;
                }, {} as Record<string, string>);
            }
        }

        setSelectionMode(nextMode);
        setSelectedItemIds(nextSelectedItemIds);
        setCustomFieldValues(nextCustomFieldValues);
        setHydratedBatchId(pack.batch.id);
    }, [hydratedBatchId, pack]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(QR_PRINT_LAYOUT_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        if (typeof window === 'undefined' || !activeBatchId || hydratedBatchId !== activeBatchId) {
            return;
        }

        const draft: QrPrintDraft = {
            version: QR_PRINT_DRAFT_VERSION,
            batchId: activeBatchId,
            mode: selectionMode,
            selectedItemIds,
            customFieldValues
        };

        window.localStorage.setItem(createDraftKey(activeBatchId), JSON.stringify(draft));
    }, [activeBatchId, customFieldValues, hydratedBatchId, selectedItemIds, selectionMode]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (activeBatchId) {
            params.set('batchId', activeBatchId);
            params.set('mode', selectionMode);
            if (selectionMode === 'selected' && selectedItemIds.length > 0) {
                params.set('ids', selectedItemIds.join(','));
            }
        }

        setSearchParams(params, { replace: true });
    }, [activeBatchId, selectedItemIds, selectionMode, setSearchParams]);

    useEffect(() => {
        const viewport = documentViewportRef.current;
        if (!viewport || typeof ResizeObserver === 'undefined') {
            return;
        }

        const updateScale = () => {
            const availableWidth = Math.max(viewport.clientWidth - 24, 180);
            const availableHeight = Math.max(viewport.clientHeight - 24, 240);
            const fitWidth = Math.min(availableWidth, availableHeight * A4_ASPECT_RATIO);
            const unclampedScale = fitWidth / A4_WIDTH_PX;
            const nextScale = Math.min(1, Math.max(0.2, unclampedScale));

            setPagePreviewMetrics({
                width: A4_WIDTH_PX * nextScale,
                height: A4_HEIGHT_PX * nextScale,
                scale: nextScale
            });
        };

        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(viewport);

        return () => observer.disconnect();
    }, []);

    const confirmBatchSwitch = (nextBatchId: string) => {
        if (!activeBatchId || nextBatchId === activeBatchId || !hasDraftChanges) {
            return true;
        }

        return window.confirm('Сменить партию? Текущие выбранные позиции и ручные подписи останутся только в локальном draft этой партии.');
    };

    const applyBatchSelection = (nextProductId: string, nextBatchId: string) => {
        if (!confirmBatchSwitch(nextBatchId)) {
            return;
        }

        setActiveProductId(nextProductId);
        setActiveBatchId(nextBatchId);
        setPack(null);
        setPackError('');
        setPackLoading(Boolean(nextBatchId));
        setHydratedBatchId('');
    };

    const handleProductChange = (nextProductId: string) => {
        if (!nextProductId) {
            if (!confirmBatchSwitch('')) {
                return;
            }

            setActiveProductId('');
            setActiveBatchId('');
            setPack(null);
            setPackError('');
            setPackLoading(false);
            setHydratedBatchId('');
            return;
        }

        const nextProduct = productsWithBatches.find((product) => product.id === nextProductId);
        const nextBatchId = nextProduct?.batches[0]?.id || '';

        if (!nextBatchId) {
            setActiveProductId(nextProductId);
            return;
        }

        applyBatchSelection(nextProductId, nextBatchId);
    };

    const handleBatchChange = (nextBatchId: string) => {
        if (!nextBatchId || !selectedProduct) {
            return;
        }

        applyBatchSelection(selectedProduct.id, nextBatchId);
    };

    const toggleSelectedItem = (itemId: string) => {
        setSelectedItemIds((current) => (
            current.includes(itemId)
                ? current.filter((value) => value !== itemId)
                : [...current, itemId]
        ));
    };

    const updateCustomFieldValue = (itemId: string, value: string) => {
        setCustomFieldValues((current) => ({
            ...current,
            [itemId]: value
        }));
    };

    const updateNumericSetting = (
        key: 'labelWidthMm' | 'labelHeightMm' | 'labelRadiusMm' | 'qrSizeMm' | 'pagePaddingMm' | 'gapMm',
        value: string,
        minimum: number,
        maximum: number
    ) => {
        setSettings((current) => ({
            ...current,
            [key]: clampNumber(value, minimum, maximum, current[key])
        }));
    };

    const updateFieldConfig = (fieldKey: QrFieldKey, patch: Partial<QrFieldConfig>) => {
        setSettings((current) => ({
            ...current,
            fields: {
                ...current.fields,
                [fieldKey]: {
                    ...current.fields[fieldKey],
                    ...patch
                }
            }
        }));
    };

    const handlePreviewDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) {
            return;
        }

        if (active.id === QR_BLOCK_ID) {
            if (over.id === QR_SLOT_LEFT_ID || over.id === QR_SLOT_RIGHT_ID) {
                setSettings((current) => ({
                    ...current,
                    qrSide: over.id === QR_SLOT_LEFT_ID ? 'left' : 'right'
                }));
            }
            return;
        }

        const activeField = String(active.id) as QrFieldKey;
        const overField = String(over.id) as QrFieldKey;

        if (!FIELD_KEYS.includes(activeField) || !FIELD_KEYS.includes(overField) || activeField === overField) {
            return;
        }

        setSettings((current) => ({
            ...current,
            fieldOrder: arrayMove(
                current.fieldOrder,
                current.fieldOrder.indexOf(activeField),
                current.fieldOrder.indexOf(overField)
            )
        }));
    };

    const pageCaption = `На лист A4 помещается ${cardsPerRow} × ${rowsPerPage} = ${cardsPerPage} этикеток`;
    const documentScale = pagePreviewMetrics.scale;
    const previewPages = pages.length > 0 ? pages : [[] as QrDocumentItem[]];
    const emptyPageMessage = !activeBatchId
        ? 'Выберите товар и партию слева, чтобы собрать лист.'
        : packLoading
            ? 'Загружаем QR-пакет партии...'
            : packError
                ? packError
                : selectionMode === 'selected'
                    ? 'Пока не выбрано ни одной позиции для PDF.'
                    : 'Для этой партии пока нет публичных QR-позиций.';

    const closeWindowOrReturn = () => {
        if (window.opener) {
            window.close();
            return;
        }

        navigate('/admin/products');
    };

    const savePdfDocument = async () => {
        if (pdfExporting) {
            return;
        }

        if (documentItems.length === 0) {
            window.alert('Сначала соберите документ: выберите партию и добавьте QR-этикетки.');
            return;
        }

        const settingsErrors = validatePdfSettings(settings, cardsPerRow, rowsPerPage);
        if (settingsErrors.length > 0) {
            window.alert(`PDF не сохранен: параметры документа расходятся с A4.\n\n${settingsErrors.join('\n')}`);
            return;
        }

        let exportRoot: HTMLElement | null = null;
        setPdfExporting(true);

        try {
            const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                import('html2canvas'),
                import('jspdf')
            ]);

            exportRoot = createPdfExportRoot({ pages, settings, cardsPerRow });
            document.body.appendChild(exportRoot);

            await document.fonts?.ready;
            await waitForExportImages(exportRoot);

            const geometryErrors = validateExportDomGeometry(exportRoot, settings, pages.length, documentItems.length);
            if (geometryErrors.length > 0) {
                throw new Error(`PDF не сохранен: документ отличается от заданных параметров.\n\n${geometryErrors.join('\n')}`);
            }

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });
            const pageElements = Array.from(exportRoot.querySelectorAll<HTMLElement>('[data-qr-pdf-page="true"]'));

            for (const [pageIndex, pageElement] of pageElements.entries()) {
                if (pageIndex > 0) {
                    pdf.addPage();
                }

                const canvas = await html2canvas(pageElement, {
                    backgroundColor: '#ffffff',
                    scale: PDF_EXPORT_SCALE,
                    useCORS: true,
                    logging: false,
                    width: Math.ceil(A4_WIDTH_PX),
                    height: Math.ceil(A4_HEIGHT_PX),
                    windowWidth: Math.ceil(A4_WIDTH_PX),
                    windowHeight: Math.ceil(A4_HEIGHT_PX),
                    scrollX: 0,
                    scrollY: 0
                });
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
            }

            pdf.save(buildPdfFilename(pack?.batch.id || activeBatchId || null));
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'Не удалось сохранить PDF-документ.');
        } finally {
            exportRoot?.remove();
            setPdfExporting(false);
        }
    };

    return (
        <div className="admin-shell qr-print-root flex min-h-[100svh] flex-col overflow-y-auto text-gray-100 lg:h-[100svh] lg:overflow-hidden">
            <style>
                {`
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }

                    @media screen {
                        .qr-print-value {
                            display: none !important;
                        }

                        .qr-stable-scroll {
                            scrollbar-gutter: stable both-edges;
                        }
                    }

                    @media print {
                        html, body {
                            background: #ffffff !important;
                        }

                        body {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        .qr-screen-only {
                            display: none !important;
                        }

                        .qr-print-root {
                            height: auto !important;
                            background: #ffffff !important;
                            overflow: visible !important;
                        }

                        .qr-document-panel {
                            display: none !important;
                        }

                        .qr-print-page {
                            margin: 0 auto !important;
                            box-shadow: none !important;
                            page-break-after: always;
                            break-after: page;
                        }

                        .qr-print-page:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }

                        .qr-label-card {
                            box-shadow: none !important;
                        }

                        .qr-editable-input {
                            display: none !important;
                        }

                        .qr-print-value {
                            display: block !important;
                        }
                    }
                `}
            </style>

            <header className="qr-screen-only shrink-0 border-b border-white/6 bg-black/10">
                <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                    <div className="flex min-w-0 items-start gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/admin/products')}
                            className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                            aria-label="Вернуться к товарам"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="min-w-0">
                            <p className="admin-chip w-fit">Товары / QR-печать</p>
                            <h1 className="mt-3 text-[1.9rem] font-semibold leading-tight tracking-tight text-white">HQ-сервис QR PDF</h1>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                Сбор PDF-документа A4 из публичных QR партии. Источник, превью и настройки остаются на одном рабочем экране.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
                        <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-gray-300">
                                В документе: {documentItems.length}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-gray-300">
                                {pageCaption}
                            </span>
                            {pack && (
                                <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                                    Партия: {pack.batch.id}
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setSettings(createDefaultSettings())}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3.5 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                            >
                                <RotateCcw size={16} />
                                Сбросить
                            </button>
                            <button
                                type="button"
                                onClick={savePdfDocument}
                                disabled={pdfExporting || documentItems.length === 0}
                                className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Download size={16} />
                                {pdfExporting ? 'Сохраняем PDF...' : 'Сохранить PDF'}
                            </button>
                            <button
                                type="button"
                                onClick={closeWindowOrReturn}
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-3.5 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                            >
                                <X size={16} />
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="mx-auto grid w-full min-w-0 max-w-[1680px] flex-1 gap-4 px-4 py-4 sm:px-6 lg:min-h-0 lg:grid-cols-[312px_minmax(0,1fr)] lg:px-8 xl:grid-cols-[320px_minmax(0,1fr)_400px] 2xl:grid-cols-[332px_minmax(0,1fr)_420px]">
                    <section className="admin-panel qr-screen-only flex min-h-[420px] min-w-0 flex-col rounded-[24px] px-4 py-4 lg:min-h-0">
                        <div className="mb-4 border-b border-white/6 pb-4">
                            <h2 className="text-base font-semibold text-white">Источник данных</h2>
                            <p className="mt-1 text-sm text-gray-500">Выберите товар-шаблон, партию и состав QR для PDF.</p>
                        </div>

                        <div className="qr-stable-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
                            <label className="block">
                                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Товар-шаблон</span>
                                <select
                                    value={activeProductId}
                                    onChange={(event) => handleProductChange(event.target.value)}
                                    className={`${QR_CONTROL_CLASS} h-11 px-3`}
                                >
                                    <option value="">Выберите товар-шаблон</option>
                                    {productsWithBatches.map((product) => (
                                        <option key={product.id} value={product.id}>
                                            {getDefaultTranslationValue(product.translations, 'name') || product.id}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Партии</span>
                                    {selectedProduct && <span className="text-xs text-gray-500">{selectedProduct.batches.length} шт.</span>}
                                </div>

                                {!selectedProduct ? (
                                    <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1217] px-3 py-4 text-sm text-gray-500">
                                        Выберите товар, чтобы увидеть партии.
                                    </div>
                                ) : (
                                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                                        {selectedProduct.batches.map((batch) => {
                                            const isActive = batch.id === activeBatchId;
                                            return (
                                                <button
                                                    key={batch.id}
                                                    type="button"
                                                    onClick={() => handleBatchChange(batch.id)}
                                                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${isActive
                                                        ? 'border-blue-500/40 bg-blue-500/10'
                                                        : 'border-white/6 bg-[#141821] hover:border-white/10 hover:bg-[#1b1e24]'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold text-white">{batch.id}</p>
                                                            <p className="mt-0.5 text-xs text-gray-500">
                                                                {new Date(batch.created_at).toLocaleString('ru-RU')} • {batch.items_count} шт.
                                                            </p>
                                                        </div>
                                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
                                                            {batch.status}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Режим документа</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectionMode('all')}
                                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${selectionMode === 'all'
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-white/8 bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white'
                                            }`}
                                    >
                                        Все QR
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectionMode('selected')}
                                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${selectionMode === 'selected'
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-white/8 bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white'
                                            }`}
                                    >
                                        Выбрать вручную
                                    </button>
                                </div>
                            </div>

                            {productsLoading && (
                                <div className="rounded-xl border border-white/6 bg-[#0f1217] px-3 py-4 text-sm text-gray-400">
                                    Загружаем товарные шаблоны...
                                </div>
                            )}

                            {productsError && (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {productsError}
                                </div>
                            )}

                            {packLoading && (
                                <div className="rounded-xl border border-white/6 bg-[#0f1217] px-3 py-4 text-sm text-gray-400">
                                    Загружаем QR-пакет партии...
                                </div>
                            )}

                            {packError && (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                    {packError}
                                </div>
                            )}

                            {!packLoading && pack && (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
                                            Доступно QR: {pack.items.length}
                                        </span>
                                        <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">
                                            В листе: {documentItems.length}
                                        </span>
                                    </div>

                                    {selectionMode === 'selected' ? (
                                        <div className="space-y-2">
                                            {pack.items.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1217] px-3 py-4 text-sm text-gray-500">
                                                    В этой партии нет публичных QR-позиций.
                                                </div>
                                            ) : (
                                                pack.items.map((item) => {
                                                    const selectedIndex = selectedItemIds.indexOf(item.id);
                                                    const isSelected = selectedIndex !== -1;

                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => toggleSelectedItem(item.id)}
                                                            className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${isSelected
                                                                ? 'border-blue-500/40 bg-blue-500/10'
                                                                : 'border-white/6 bg-[#141821] hover:border-white/10 hover:bg-[#1b1e24]'
                                                                }`}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-white">
                                                                        {item.serial_number || item.temp_id}
                                                                    </p>
                                                                    <p className="mt-0.5 text-xs text-gray-500">Позиция #{item.temp_id}</p>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {isSelected && (
                                                                        <span className="rounded-full bg-blue-500/20 px-2 py-1 text-[10px] font-semibold text-blue-100">
                                                                            #{selectedIndex + 1}
                                                                        </span>
                                                                    )}
                                                                    <span className={`h-4 w-4 rounded-full border ${isSelected ? 'border-blue-400 bg-blue-400' : 'border-gray-600 bg-transparent'}`} />
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-white/8 bg-[#0f1217] px-3 py-4 text-sm text-gray-500">
                                            В документ автоматически попадут все публичные QR этой партии.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="admin-panel qr-document-panel flex min-h-[620px] min-w-0 flex-col rounded-[24px] p-4 lg:min-h-0">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-4">
                            <div>
                                <h2 className="text-base font-semibold text-white">PDF-лист</h2>
                                <p className="mt-1 text-sm text-gray-500">Центральное превью показывает фактическую раскладку A4.</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
                                <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">Масштаб: {Math.round(documentScale * 100)}%</span>
                                {settings.invertColors && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-100">Инверсия</span>}
                            </div>
                        </div>

                        <div ref={documentViewportRef} className="qr-document-pages qr-stable-scroll min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/6 bg-[#0f1217] p-3">
                            {previewPages.map((pageItems, pageIndex) => {
                                const showEmptyState = documentItems.length === 0 && pageIndex === 0;
                                return (
                                    <div
                                        key={`qr-document-page-frame-${pageIndex}`}
                                        className="qr-document-page-frame relative mx-auto overflow-hidden rounded-[18px] bg-white shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
                                        style={{
                                            width: `${pagePreviewMetrics.width}px`,
                                            height: `${pagePreviewMetrics.height}px`
                                        }}
                                    >
                                        <article
                                            className="qr-document-page absolute left-0 top-0 bg-white"
                                            style={{
                                                width: `${A4_WIDTH_MM}mm`,
                                                height: `${A4_HEIGHT_MM}mm`,
                                                transform: `scale(${documentScale})`,
                                                transformOrigin: 'top left'
                                            }}
                                        >
                                            {showEmptyState ? (
                                                <div className={`absolute inset-0 flex items-center justify-center px-10 text-center text-sm ${packError ? 'text-red-500' : 'text-slate-500'}`}>
                                                    {emptyPageMessage}
                                                </div>
                                            ) : (
                                                <div className="grid" style={buildPageGridStyle(settings, cardsPerRow)}>
                                                    {pageItems.map((item) => (
                                                        <PrintLabelCard
                                                            key={item.id}
                                                            item={item}
                                                            settings={settings}
                                                            onCustomTextChange={updateCustomFieldValue}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </article>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="admin-panel qr-screen-only flex min-h-[620px] min-w-0 flex-col rounded-[24px] p-4 lg:col-span-2 lg:min-h-0 xl:col-span-1">
                        <div className="mb-4 border-b border-white/6 pb-4">
                            <h2 className="text-base font-semibold text-white">Настройки</h2>
                            <p className="mt-1 text-sm text-gray-500">Превью этикетки, геометрия листа и параметры полей.</p>
                        </div>

                        <div className="qr-stable-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
                            <div className="admin-panel-soft rounded-2xl p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-sm font-semibold text-white">Интерактивное превью одной этикетки</h3>
                                        <p className="text-xs text-gray-500">Меняйте порядок полей и сторону QR перетаскиванием.</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                        <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-blue-100">
                                            <MoveHorizontal size={12} />
                                            QR {settings.qrSide === 'left' ? 'слева' : 'справа'}
                                        </span>
                                        {settings.invertColors && (
                                            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-100">
                                                Инверсия
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="h-[236px] overflow-hidden">
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePreviewDragEnd}>
                                        <LabelEditorPreview
                                            item={previewItem}
                                            settings={settings}
                                            visibleFieldOrder={visibleFieldOrder}
                                        />
                                    </DndContext>
                                </div>
                            </div>

                            <div className="admin-panel-soft space-y-3 rounded-2xl p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Геометрия листа</span>
                                    <span className="text-xs text-gray-500">{pageCaption}</span>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <NumericField
                                        compact
                                        label="Ширина, мм"
                                        value={settings.labelWidthMm}
                                        onChange={(value) => updateNumericSetting('labelWidthMm', value, 30, 140)}
                                    />
                                    <NumericField
                                        compact
                                        label="Высота, мм"
                                        value={settings.labelHeightMm}
                                        onChange={(value) => updateNumericSetting('labelHeightMm', value, 20, 120)}
                                    />
                                    <NumericField
                                        compact
                                        label="QR, мм"
                                        value={settings.qrSizeMm}
                                        onChange={(value) => updateNumericSetting('qrSizeMm', value, 10, 60)}
                                    />
                                    <NumericField
                                        compact
                                        label="Скругление, мм"
                                        value={settings.labelRadiusMm}
                                        onChange={(value) => updateNumericSetting('labelRadiusMm', value, 0, 16)}
                                    />
                                    <NumericField
                                        compact
                                        label="Поля листа, мм"
                                        value={settings.pagePaddingMm}
                                        onChange={(value) => updateNumericSetting('pagePaddingMm', value, 4, 20)}
                                    />
                                    <NumericField
                                        compact
                                        label="Зазор, мм"
                                        value={settings.gapMm}
                                        onChange={(value) => updateNumericSetting('gapMm', value, 2, 20)}
                                    />
                                </div>

                                <label className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-[#11141a] px-3 py-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">Инверсия для PDF</p>
                                        <p className="text-xs text-gray-500">Черный фон, светлый текст и инвертированный QR.</p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={settings.invertColors}
                                        onChange={(event) => setSettings((current) => ({ ...current, invertColors: event.target.checked }))}
                                        className="h-4 w-4 rounded border-gray-600 bg-[#11141a]"
                                    />
                                </label>
                            </div>

                            <div className="space-y-2">
                                {FIELD_KEYS.map((fieldKey) => {
                                    const config = settings.fields[fieldKey];
                                    return (
                                        <div key={fieldKey} className="rounded-xl border border-white/6 bg-[#141821] p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <label className="inline-flex items-center gap-3 text-sm font-medium text-white">
                                                    <input
                                                        type="checkbox"
                                                        checked={config.enabled}
                                                        onChange={(event) => updateFieldConfig(fieldKey, { enabled: event.target.checked })}
                                                        className="h-4 w-4 rounded border-gray-600 bg-[#11141a]"
                                                    />
                                                    {FIELD_LABELS[fieldKey]}
                                                </label>
                                                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1">
                                                        {config.enabled ? 'Включено' : 'Скрыто'}
                                                    </span>
                                                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1">
                                                        #{settings.fieldOrder.indexOf(fieldKey) + 1}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-3 grid gap-2 sm:grid-cols-[96px_110px_minmax(0,1fr)]">
                                                <NumericField
                                                    compact
                                                    label="Размер, px"
                                                    value={config.fontSizePx}
                                                    onChange={(value) => updateFieldConfig(fieldKey, {
                                                        fontSizePx: clampNumber(value, 9, 40, config.fontSizePx)
                                                    })}
                                                />

                                                <label className="block">
                                                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Жирность</span>
                                                    <select
                                                        value={String(config.fontWeight)}
                                                        onChange={(event) => updateFieldConfig(fieldKey, { fontWeight: Number(event.target.value) })}
                                                        className={`${QR_CONTROL_CLASS} h-10 px-3`}
                                                    >
                                                        {FONT_WEIGHT_OPTIONS.map((option) => (
                                                            <option key={option} value={option}>
                                                                {option}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>

                                                <label className="block">
                                                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Шрифт</span>
                                                    <select
                                                        value={config.fontFamily}
                                                        onChange={(event) => updateFieldConfig(fieldKey, { fontFamily: event.target.value })}
                                                        className={`${QR_CONTROL_CLASS} h-10 px-3`}
                                                    >
                                                        {FONT_OPTIONS.map((option) => (
                                                            <option key={option} value={option}>
                                                                {option}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
            </div>

        </div>
    );
}

function LabelEditorPreview({
    item,
    settings,
    visibleFieldOrder
}: {
    item: QrDocumentItem;
    settings: QrPrintSettings;
    visibleFieldOrder: QrFieldKey[];
}) {
    const labelHeightPx = Math.max(210, settings.labelHeightMm * 3.4);
    const qrSizePx = Math.min(96, Math.max(56, settings.qrSizeMm * 2.5));
    const slotWidthPx = Math.max(68, qrSizePx + 10);
    const textFields = visibleFieldOrder;
    const shellClass = settings.invertColors
        ? 'border-white/10 bg-black'
        : 'border-white/6 bg-[#0f1217]';

    return (
        <div className="h-full overflow-hidden">
            <div
                className={`h-full rounded-2xl border p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${shellClass}`}
                style={{
                    width: '100%',
                    minHeight: `${labelHeightPx}px`
                }}
            >
                <div className="flex h-full items-stretch gap-2">
                    <QrSlot
                        slotId={QR_SLOT_LEFT_ID}
                        isActive={settings.qrSide === 'left'}
                        qrSizePx={qrSizePx}
                        slotWidthPx={slotWidthPx}
                        item={item}
                        invertColors={settings.invertColors}
                    />

                    <div className={`flex min-w-0 flex-1 flex-col justify-between rounded-xl border border-dashed p-2 ${settings.invertColors ? 'border-white/10 bg-white/[0.03]' : 'border-white/8 bg-black/20'}`}>
                        <SortableContext items={textFields} strategy={verticalListSortingStrategy}>
                            <div className="flex h-full flex-col gap-1.5 overflow-hidden">
                                {textFields.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-white/8 px-3 py-4 text-xs text-gray-500">
                                        Включите хотя бы одну надпись в настройках справа.
                                    </div>
                                ) : (
                                    textFields.map((fieldKey) => (
                                        <SortableFieldPreview
                                            key={fieldKey}
                                            id={fieldKey}
                                            label={FIELD_LABELS[fieldKey]}
                                            value={getFieldValue(item, fieldKey) || FIELD_LABELS[fieldKey]}
                                            style={getFieldStyle(settings.fields[fieldKey])}
                                            invertColors={settings.invertColors}
                                        />
                                    ))
                                )}
                            </div>
                        </SortableContext>
                    </div>

                    <QrSlot
                        slotId={QR_SLOT_RIGHT_ID}
                        isActive={settings.qrSide === 'right'}
                        qrSizePx={qrSizePx}
                        slotWidthPx={slotWidthPx}
                        item={item}
                        invertColors={settings.invertColors}
                    />
                </div>
            </div>
        </div>
    );
}

function QrSlot({
    slotId,
    isActive,
    qrSizePx,
    slotWidthPx,
    item,
    invertColors
}: {
    slotId: string;
    isActive: boolean;
    qrSizePx: number;
    slotWidthPx: number;
    item: QrDocumentItem;
    invertColors: boolean;
}) {
    const { isOver, setNodeRef } = useDroppable({ id: slotId });

    return (
        <div
            ref={setNodeRef}
            className={`flex min-w-[72px] items-center justify-center rounded-xl border p-2 transition ${isOver
                ? 'border-blue-400 bg-blue-500/10'
                : invertColors
                    ? 'border-dashed border-white/10 bg-white/[0.03]'
                    : 'border-dashed border-white/8 bg-black/20'
                }`}
            style={{ width: `${slotWidthPx}px` }}
        >
            {isActive ? (
                <DraggableQrBlock
                    qrSizePx={qrSizePx}
                    qrUrl={item.qrUrl}
                    serialNumber={item.serialNumber}
                    invertColors={invertColors}
                />
            ) : (
                <div className="px-1 text-center text-[10px] text-gray-500">
                    Перетащите QR сюда
                </div>
            )}
        </div>
    );
}

function DraggableQrBlock({
    qrSizePx,
    qrUrl,
    serialNumber,
    invertColors
}: {
    qrSizePx: number;
    qrUrl: string;
    serialNumber: string;
    invertColors: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: QR_BLOCK_ID });

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`flex cursor-grab flex-col items-center gap-2 rounded-xl border px-2 py-2 text-center active:cursor-grabbing ${invertColors
                ? 'border-white/10 bg-black text-white'
                : 'border-gray-200 bg-white text-slate-900'
                } ${isDragging ? 'opacity-60' : ''}`}
            style={{
                transform: CSS.Translate.toString(transform),
                width: `${Math.max(qrSizePx + 12, 72)}px`
            }}
        >
            <div
                className={`flex items-center justify-center rounded-xl border ${invertColors ? 'border-slate-700 bg-black' : 'border-gray-200 bg-white'}`}
                style={{
                    width: `${qrSizePx}px`,
                    height: `${qrSizePx}px`
                }}
            >
                {qrUrl ? (
                    <img
                        src={qrUrl}
                        alt={`QR ${serialNumber}`}
                        className="h-full w-full object-contain"
                        style={{ filter: invertColors ? 'invert(1)' : 'none' }}
                    />
                ) : (
                    <QrCode size={Math.max(36, qrSizePx * 0.55)} className={invertColors ? 'text-white' : 'text-gray-300'} />
                )}
            </div>
            <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${invertColors ? 'border-slate-700 text-slate-300' : 'border-gray-200 text-gray-500'}`}>
                <MoveHorizontal size={12} />
                QR
            </div>
        </div>
    );
}

function SortableFieldPreview({
    id,
    label,
    value,
    style,
    invertColors
}: {
    id: QrFieldKey;
    label: string;
    value: string;
    style: CSSProperties;
    invertColors: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`min-w-0 rounded-xl border px-2.5 py-2 ${invertColors ? 'border-white/10 bg-white/[0.04]' : 'border-white/8 bg-[#141821]'} ${isDragging ? 'opacity-60' : ''}`}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
        >
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-gray-400 active:cursor-grabbing"
                    aria-label="Переместить поле"
                >
                    <GripVertical size={10} />
                </button>
            </div>
            <div className="truncate leading-tight text-white" style={style} title={value}>
                {value}
            </div>
        </div>
    );
}

function PrintLabelCard({
    item,
    settings,
    onCustomTextChange
}: {
    item: QrDocumentItem;
    settings: QrPrintSettings;
    onCustomTextChange: (itemId: string, value: string) => void;
}) {
    const orderedFields = settings.fieldOrder.filter((fieldKey) => settings.fields[fieldKey].enabled);
    const isInverted = settings.invertColors;

    return (
        <article
            className={`qr-label-card flex overflow-hidden border ${settings.qrSide === 'left' ? '' : 'flex-row-reverse'}`}
            style={{
                width: `${settings.labelWidthMm}mm`,
                height: `${settings.labelHeightMm}mm`,
                padding: formatCssMm(LABEL_PADDING_MM),
                gap: formatCssMm(LABEL_CONTENT_GAP_MM),
                borderColor: isInverted ? '#334155' : '#e2e8f0',
                backgroundColor: isInverted ? '#020617' : '#ffffff',
                color: isInverted ? '#ffffff' : '#0f172a',
                borderRadius: formatCssMm(settings.labelRadiusMm)
            }}
        >
            <div
                className="flex shrink-0 items-center justify-center overflow-hidden border"
                style={{
                    width: `${settings.qrSizeMm}mm`,
                    height: `${settings.qrSizeMm}mm`,
                    borderColor: isInverted ? '#334155' : '#e2e8f0',
                    backgroundColor: isInverted ? '#020617' : '#ffffff',
                    borderRadius: formatCssMm(Math.min(settings.labelRadiusMm, 3))
                }}
            >
                {item.qrUrl ? (
                    <img
                        src={item.qrUrl}
                        alt={`QR ${item.serialNumber}`}
                        className="h-full w-full object-contain"
                        style={{ filter: isInverted ? 'invert(1)' : 'none' }}
                    />
                ) : (
                    <QrCode className={isInverted ? 'text-white' : 'text-slate-300'} size={32} />
                )}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex h-full flex-col justify-center gap-[1.6mm] overflow-hidden">
                    {orderedFields.map((fieldKey) => {
                        const fieldConfig = settings.fields[fieldKey];

                        if (fieldKey === 'customText') {
                            return (
                                <div key={fieldKey} className="min-w-0" style={getFieldStyle(fieldConfig)}>
                                    <input
                                        value={item.customText}
                                        onChange={(event) => onCustomTextChange(item.itemId, event.target.value)}
                                        placeholder="Введите свой текст"
                                        className={`qr-editable-input w-full rounded-[2mm] border border-dashed px-[1.6mm] py-[1.2mm] text-inherit outline-none ${isInverted
                                            ? 'border-slate-600 bg-black/30 text-white placeholder:text-slate-500'
                                            : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
                                            }`}
                                        style={{
                                            ...getFieldStyle(fieldConfig),
                                            borderRadius: formatCssMm(Math.min(settings.labelRadiusMm, 2))
                                        }}
                                    />
                                    {item.customText.trim() && (
                                        <div className="qr-print-value break-words">
                                            {item.customText}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        const value = getFieldValue(item, fieldKey);
                        if (!value) {
                            return null;
                        }

                        return (
                            <p key={fieldKey} className="break-words" style={getFieldStyle(fieldConfig)}>
                                {value}
                            </p>
                        );
                    })}
                </div>
            </div>
        </article>
    );
}

function NumericField({
    label,
    value,
    onChange,
    compact = false
}: {
    label: string;
    value: number;
    onChange: (value: string) => void;
    compact?: boolean;
}) {
    return (
        <label className="block">
            <span className={`block font-semibold uppercase tracking-[0.18em] text-gray-500 ${compact ? 'mb-1.5 text-[11px]' : 'mb-2 text-xs'}`}>{label}</span>
            <input
                type="number"
                min="0"
                step="1"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={`${QR_CONTROL_CLASS} ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}
            />
        </label>
    );
}
