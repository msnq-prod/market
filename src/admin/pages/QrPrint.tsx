import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
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
import { ArrowLeft, ChevronLeft, ChevronRight, Download, GripVertical, RotateCcw, X } from 'lucide-react';
import { authFetch } from '../../utils/authFetch';

type Html2CanvasRenderer = typeof import('html2canvas').default;

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
    spacingBeforeMm: number;
    spacingAfterMm: number;
};

export type QrPrintSettings = {
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

type QrPreviewPageImage = {
    id: string;
    dataUrl: string;
    width: number;
    height: number;
    pageNumber: number;
};

type QrPrintPreset = {
    id: string;
    name: string;
    settings: QrPrintSettings;
    created_by_user_id: string;
    updated_by_user_id: string | null;
    created_at: string;
    updated_at: string;
};

const QR_PRINT_LAYOUT_KEY = 'qr-print-layout:v1';
const QR_PRINT_DRAFT_VERSION = 1;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MM_TO_PX = 96 / 25.4;
const A4_WIDTH_PX = A4_WIDTH_MM * MM_TO_PX;
const A4_HEIGHT_PX = A4_HEIGHT_MM * MM_TO_PX;
const A4_ASPECT_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM;
const DEFAULT_LABEL_PADDING_MM = 3;
const DEFAULT_FIELD_SPACING_BEFORE_MM = 0;
const DEFAULT_FIELD_SPACING_AFTER_MM = 1.6;
const LABEL_CONTENT_GAP_MM = 3;
const PDF_EXPORT_SCALE = 2;
const QR_PREVIEW_RENDER_SCALE = 2;
const QR_PREVIEW_RENDER_DEBOUNCE_MS = 250;
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
            labelPaddingTopMm: clampNumber(parsed.labelPaddingTopMm, 0, 20, defaults.labelPaddingTopMm),
            labelPaddingRightMm: clampNumber(parsed.labelPaddingRightMm, 0, 20, defaults.labelPaddingRightMm),
            labelPaddingBottomMm: clampNumber(parsed.labelPaddingBottomMm, 0, 20, defaults.labelPaddingBottomMm),
            labelPaddingLeftMm: clampNumber(parsed.labelPaddingLeftMm, 0, 20, defaults.labelPaddingLeftMm),
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
                        : defaults.fields[key].fontFamily,
                    spacingBeforeMm: clampNumber(source.spacingBeforeMm, 0, 20, defaults.fields[key].spacingBeforeMm),
                    spacingAfterMm: clampNumber(source.spacingAfterMm, 0, 20, defaults.fields[key].spacingAfterMm)
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

const getLabelInnerWidthMm = (settings: QrPrintSettings) => (
    settings.labelWidthMm - settings.labelPaddingLeftMm - settings.labelPaddingRightMm
);

const getLabelInnerHeightMm = (settings: QrPrintSettings) => (
    settings.labelHeightMm - settings.labelPaddingTopMm - settings.labelPaddingBottomMm
);

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

const getA4CaptureOptions = (scale: number): NonNullable<Parameters<Html2CanvasRenderer>[1]> => ({
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    width: Math.ceil(A4_WIDTH_PX),
    height: Math.ceil(A4_HEIGHT_PX),
    windowWidth: Math.ceil(A4_WIDTH_PX),
    windowHeight: Math.ceil(A4_HEIGHT_PX),
    scrollX: 0,
    scrollY: 0
});

const captureA4Page = (html2canvas: Html2CanvasRenderer, pageElement: HTMLElement, scale: number) => (
    html2canvas(pageElement, getA4CaptureOptions(scale))
);

const applyPdfFieldStyle = (element: HTMLElement, config: QrFieldConfig) => {
    setElementStyles(element, {
        'font-size': `${config.fontSizePx}px`,
        'font-weight': String(config.fontWeight),
        'font-family': config.fontFamily,
        'line-height': '1.2',
        'overflow-wrap': 'break-word',
        'word-break': 'break-word',
        margin: '0',
        'margin-top': formatCssMm(config.spacingBeforeMm),
        'margin-bottom': formatCssMm(config.spacingAfterMm)
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
    const labelInnerWidthMm = getLabelInnerWidthMm(settings);
    const labelInnerHeightMm = getLabelInnerHeightMm(settings);
    const maxRadiusMm = Math.min(settings.labelWidthMm, settings.labelHeightMm) / 2;

    if (usedWidthMm - contentWidthMm > 0.01) {
        errors.push(`Ширина ряда ${formatMmValue(usedWidthMm)} мм больше доступной области A4 ${formatMmValue(contentWidthMm)} мм.`);
    }

    if (usedHeightMm - contentHeightMm > 0.01) {
        errors.push(`Высота ряда ${formatMmValue(usedHeightMm)} мм больше доступной области A4 ${formatMmValue(contentHeightMm)} мм.`);
    }

    if (labelInnerWidthMm <= 0 || labelInnerHeightMm <= 0) {
        errors.push(`Внутренние отступы больше размера этикетки: доступно ${formatMmValue(labelInnerWidthMm)} × ${formatMmValue(labelInnerHeightMm)} мм.`);
    } else if (settings.qrSizeMm - labelInnerWidthMm > 0.01 || settings.qrSizeMm - labelInnerHeightMm > 0.01) {
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
        'padding-top': formatCssMm(settings.labelPaddingTopMm),
        'padding-right': formatCssMm(settings.labelPaddingRightMm),
        'padding-bottom': formatCssMm(settings.labelPaddingBottomMm),
        'padding-left': formatCssMm(settings.labelPaddingLeftMm),
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
        'align-items': 'flex-start',
        'box-sizing': 'border-box'
    });

    const textStack = document.createElement('div');
    setElementStyles(textStack, {
        display: 'flex',
        width: '100%',
        'flex-direction': 'column',
        'justify-content': 'flex-start',
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

const renderPreviewPageImages = async ({
    pages,
    settings,
    cardsPerRow
}: {
    pages: QrDocumentItem[][];
    settings: QrPrintSettings;
    cardsPerRow: number;
}): Promise<QrPreviewPageImage[]> => {
    const { default: html2canvas } = await import('html2canvas');
    const exportRoot = createPdfExportRoot({ pages, settings, cardsPerRow });

    try {
        document.body.appendChild(exportRoot);
        await document.fonts?.ready;
        await waitForExportImages(exportRoot);

        const expectedLabelCount = pages.reduce((total, pageItems) => total + pageItems.length, 0);
        const geometryErrors = validateExportDomGeometry(exportRoot, settings, pages.length, expectedLabelCount);
        if (geometryErrors.length > 0) {
            throw new Error(`Превью не обновлено: документ отличается от заданных параметров.\n\n${geometryErrors.join('\n')}`);
        }

        const pageElements = Array.from(exportRoot.querySelectorAll<HTMLElement>('[data-qr-pdf-page="true"]'));
        const renderedPages: QrPreviewPageImage[] = [];

        for (const [pageIndex, pageElement] of pageElements.entries()) {
            const canvas = await captureA4Page(html2canvas, pageElement, QR_PREVIEW_RENDER_SCALE);
            renderedPages.push({
                id: `preview-page-${pageIndex + 1}-${canvas.width}x${canvas.height}`,
                dataUrl: canvas.toDataURL('image/png'),
                width: canvas.width,
                height: canvas.height,
                pageNumber: pageIndex + 1
            });
        }

        return renderedPages;
    } finally {
        exportRoot.remove();
    }
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
    const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
    const [previewImages, setPreviewImages] = useState<QrPreviewPageImage[]>([]);
    const [previewRendering, setPreviewRendering] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [printPresets, setPrintPresets] = useState<QrPrintPreset[]>([]);
    const [presetsLoading, setPresetsLoading] = useState(false);
    const [presetSaving, setPresetSaving] = useState(false);
    const [presetError, setPresetError] = useState('');
    const [activePresetId, setActivePresetId] = useState('');
    const [presetName, setPresetName] = useState('');
    const previewRenderSeqRef = useRef(0);

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

    const hasDraftChanges = activeBatchId.length > 0
        && (selectionMode === 'selected' || Object.values(customFieldValues).some((value) => value.trim().length > 0));

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

    const upsertPrintPreset = useCallback((preset: QrPrintPreset) => {
        setPrintPresets((current) => (
            [preset, ...current.filter((item) => item.id !== preset.id)]
                .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
        ));
    }, []);

    const loadPrintPresets = useCallback(async () => {
        setPresetsLoading(true);
        setPresetError('');

        try {
            const response = await authFetch('/api/qr-print-presets');
            const payload = await response.json().catch(() => ({ error: 'Не удалось загрузить пресеты печати.' }));

            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось загрузить пресеты печати.');
            }

            setPrintPresets(Array.isArray(payload) ? payload as QrPrintPreset[] : []);
        } catch (error) {
            setPresetError(error instanceof Error ? error.message : 'Не удалось загрузить пресеты печати.');
        } finally {
            setPresetsLoading(false);
        }
    }, []);

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
        void loadPrintPresets();
    }, [loadPrintPresets]);

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
        const renderSeq = previewRenderSeqRef.current + 1;
        previewRenderSeqRef.current = renderSeq;

        if (documentItems.length === 0) {
            setPreviewImages([]);
            setPreviewRendering(false);
            setPreviewError('');
            return;
        }

        const settingsErrors = validatePdfSettings(settings, cardsPerRow, rowsPerPage);
        if (settingsErrors.length > 0) {
            setPreviewImages([]);
            setPreviewRendering(false);
            setPreviewError(`Превью не обновлено: параметры документа расходятся с A4.\n\n${settingsErrors.join('\n')}`);
            return;
        }

        let cancelled = false;
        setPreviewRendering(true);
        setPreviewError('');

        const timeoutId = window.setTimeout(() => {
            void renderPreviewPageImages({ pages, settings, cardsPerRow })
                .then((renderedPages) => {
                    if (cancelled || previewRenderSeqRef.current !== renderSeq) {
                        return;
                    }

                    setPreviewImages(renderedPages);
                    setPreviewError('');
                })
                .catch((error) => {
                    if (cancelled || previewRenderSeqRef.current !== renderSeq) {
                        return;
                    }

                    setPreviewError(error instanceof Error ? error.message : 'Не удалось обновить превью PDF.');
                })
                .finally(() => {
                    if (cancelled || previewRenderSeqRef.current !== renderSeq) {
                        return;
                    }

                    setPreviewRendering(false);
                });
        }, QR_PREVIEW_RENDER_DEBOUNCE_MS);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [cardsPerRow, documentItems.length, pages, rowsPerPage, settings]);

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
        key: 'labelWidthMm'
            | 'labelHeightMm'
            | 'labelRadiusMm'
            | 'labelPaddingTopMm'
            | 'labelPaddingRightMm'
            | 'labelPaddingBottomMm'
            | 'labelPaddingLeftMm'
            | 'qrSizeMm'
            | 'pagePaddingMm'
            | 'gapMm',
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

    const handlePresetSelection = (presetId: string) => {
        setActivePresetId(presetId);
        setPresetError('');

        if (!presetId) {
            return;
        }

        const preset = printPresets.find((item) => item.id === presetId);
        if (!preset) {
            return;
        }

        setPresetName(preset.name);
        setSettings(preset.settings);
    };

    const savePrintPreset = async (forceCreate = false) => {
        const name = presetName.trim();
        if (!name) {
            setPresetError('Укажите название пресета.');
            return;
        }

        const shouldUpdate = Boolean(activePresetId) && !forceCreate;
        const endpoint = shouldUpdate
            ? `/api/qr-print-presets/${activePresetId}`
            : '/api/qr-print-presets';

        setPresetSaving(true);
        setPresetError('');

        try {
            const response = await authFetch(endpoint, {
                method: shouldUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, settings })
            });
            const payload = await response.json().catch(() => ({ error: 'Не удалось сохранить пресет печати.' }));

            if (!response.ok) {
                throw new Error(payload.error || 'Не удалось сохранить пресет печати.');
            }

            const savedPreset = payload as QrPrintPreset;
            upsertPrintPreset(savedPreset);
            setActivePresetId(savedPreset.id);
            setPresetName(savedPreset.name);
            setSettings(savedPreset.settings);
        } catch (error) {
            setPresetError(error instanceof Error ? error.message : 'Не удалось сохранить пресет печати.');
        } finally {
            setPresetSaving(false);
        }
    };

    const deletePrintPreset = async () => {
        if (!activePresetId) {
            return;
        }

        const preset = printPresets.find((item) => item.id === activePresetId);
        if (!preset) {
            return;
        }

        if (!window.confirm(`Удалить пресет "${preset.name}"?`)) {
            return;
        }

        setPresetSaving(true);
        setPresetError('');

        try {
            const response = await authFetch(`/api/qr-print-presets/${activePresetId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({ error: 'Не удалось удалить пресет печати.' }));
                throw new Error(payload.error || 'Не удалось удалить пресет печати.');
            }

            setPrintPresets((current) => current.filter((item) => item.id !== activePresetId));
            setActivePresetId('');
            setPresetName('');
        } catch (error) {
            setPresetError(error instanceof Error ? error.message : 'Не удалось удалить пресет печати.');
        } finally {
            setPresetSaving(false);
        }
    };

    const handleFieldSettingsDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) {
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

                const canvas = await captureA4Page(html2canvas, pageElement, PDF_EXPORT_SCALE);
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
        <div className="admin-shell qr-print-root flex h-[100svh] min-h-[100svh] flex-col overflow-hidden text-gray-100">
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

            <header className="qr-screen-only flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/6 bg-black/10 px-3">
                <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/admin/products')}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                        aria-label="Вернуться к товарам"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setSourcePanelOpen((current) => !current)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                        aria-label={sourcePanelOpen ? 'Свернуть источник данных' : 'Открыть источник данных'}
                    >
                        {sourcePanelOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                    </button>
                </div>

                <div className="flex min-w-0 items-center gap-2">
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
            </header>

            <div
                className="grid min-h-0 w-full min-w-0 flex-1 grid-cols-1 gap-3 p-3 transition-[grid-template-columns] duration-300 lg:grid-cols-[var(--qr-workspace-columns)]"
                style={{
                    '--qr-workspace-columns': sourcePanelOpen
                        ? '300px minmax(0,1fr) 390px'
                        : 'minmax(0,1fr) 390px'
                } as CSSProperties}
            >
                    {sourcePanelOpen && (
                        <section className="admin-panel qr-screen-only flex min-h-[360px] min-w-0 flex-col rounded-[18px] px-3 py-3 lg:min-h-0">
                            <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/6 pb-3">
                                <h2 className="text-sm font-semibold text-white">Источник данных</h2>
                                <button
                                    type="button"
                                    onClick={() => setSourcePanelOpen(false)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04] text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
                                    aria-label="Свернуть источник данных"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                            </div>

                            <div className="qr-stable-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
                            <div className="space-y-2 rounded-2xl border border-white/6 bg-[#11141a] p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Пресеты печати</span>
                                    {presetsLoading && <span className="text-[11px] text-gray-500">Загрузка...</span>}
                                </div>
                                <label className="block">
                                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Пресет печати</span>
                                    <select
                                        value={activePresetId}
                                        onChange={(event) => handlePresetSelection(event.target.value)}
                                        className={`${QR_CONTROL_CLASS} h-10 px-3`}
                                        disabled={presetsLoading || presetSaving}
                                    >
                                        <option value="">Текущая конфигурация</option>
                                        {printPresets.map((preset) => (
                                            <option key={preset.id} value={preset.id}>
                                                {preset.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Название пресета</span>
                                    <input
                                        value={presetName}
                                        onChange={(event) => setPresetName(event.target.value)}
                                        placeholder="Например: 58 × 36, QR справа"
                                        className={`${QR_CONTROL_CLASS} h-10 px-3`}
                                        disabled={presetSaving}
                                    />
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void savePrintPreset(false)}
                                        disabled={presetSaving}
                                        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Сохранить
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void savePrintPreset(true)}
                                        disabled={presetSaving}
                                        className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-xs font-medium text-gray-200 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        Сохранить как новый
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void deletePrintPreset()}
                                        disabled={!activePresetId || presetSaving}
                                        className="col-span-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Удалить
                                    </button>
                                </div>
                                {presetError && (
                                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                                        {presetError}
                                    </div>
                                )}
                            </div>

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

                                    {settings.fields.customText.enabled && documentItems.length > 0 && (
                                        <div className="space-y-2 border-t border-white/6 pt-3">
                                            <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Свое поле</span>
                                            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                                {documentItems.map((item) => (
                                                    <label
                                                        key={item.itemId}
                                                        className="block rounded-xl border border-white/6 bg-[#11141a] px-3 py-2"
                                                    >
                                                        <span className="mb-1.5 block truncate text-[11px] font-medium text-gray-400">
                                                            {item.serialNumber || `Позиция ${item.tempId}`}
                                                        </span>
                                                        <input
                                                            value={customFieldValues[item.itemId] || ''}
                                                            onChange={(event) => updateCustomFieldValue(item.itemId, event.target.value)}
                                                            placeholder="Введите свой текст"
                                                            className={`${QR_CONTROL_CLASS} h-9 px-2.5 text-xs`}
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            </div>
                        </section>
                    )}

                    <section className="admin-panel qr-document-panel relative flex min-h-[520px] min-w-0 flex-col rounded-[18px] p-0 lg:min-h-0">
                        {previewRendering && previewImages.length > 0 && (
                            <div className="qr-screen-only absolute right-4 top-4 z-20 rounded-full border border-blue-400/20 bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-100 shadow-[0_12px_30px_rgba(37,99,235,0.18)]">
                                Обновляем превью...
                            </div>
                        )}

                        <div className="qr-document-pages qr-stable-scroll min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden rounded-[18px] bg-[#0f1217] p-2">
                            {documentItems.length === 0 ? (
                                <div className="flex min-h-full items-center justify-center px-10 text-center text-sm text-slate-500">
                                    {emptyPageMessage}
                                </div>
                            ) : previewImages.length > 0 ? (
                                <>
                                    {previewError && (
                                        <div className="mx-auto max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                                            {previewError}
                                        </div>
                                    )}
                                    {previewImages.map((page) => (
                                        <div
                                            key={page.id}
                                            className="qr-preview-page-frame relative mx-auto overflow-hidden rounded-[18px] bg-white shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
                                            style={{
                                                aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}`,
                                                maxWidth: '100%',
                                                width: `min(${A4_WIDTH_PX}px, calc((100svh - 6.5rem) * ${A4_ASPECT_RATIO}), 100%)`
                                            }}
                                        >
                                            <img
                                                data-testid="qr-preview-page"
                                                src={page.dataUrl}
                                                alt={`PDF-превью страницы ${page.pageNumber}`}
                                                width={page.width}
                                                height={page.height}
                                                draggable={false}
                                                className="block h-full w-full select-none object-contain"
                                            />
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div
                                    className="mx-auto flex w-full max-w-full items-center justify-center rounded-[18px] border border-white/8 bg-white text-center text-sm text-slate-500 shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
                                    style={{
                                        aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}`,
                                        width: `min(${A4_WIDTH_PX}px, calc((100svh - 6.5rem) * ${A4_ASPECT_RATIO}), 100%)`
                                    }}
                                >
                                    {previewError || (previewRendering ? 'Готовим достоверное превью PDF...' : 'Превью PDF пока не готово.')}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="admin-panel qr-screen-only flex min-h-[520px] min-w-0 flex-col rounded-[18px] p-3 lg:min-h-0">
                        <div className="mb-3 border-b border-white/6 pb-3">
                            <h2 className="text-sm font-semibold text-white">Настройки</h2>
                        </div>

                        <div className="qr-stable-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
                            <div className="admin-panel-soft space-y-2 rounded-2xl p-3">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Положение QR</span>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSettings((current) => ({ ...current, qrSide: 'left' }))}
                                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${settings.qrSide === 'left'
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-white/8 bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white'
                                            }`}
                                    >
                                        QR слева
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSettings((current) => ({ ...current, qrSide: 'right' }))}
                                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition ${settings.qrSide === 'right'
                                            ? 'bg-blue-600 text-white'
                                            : 'border border-white/8 bg-white/[0.04] text-gray-300 hover:bg-white/[0.07] hover:text-white'
                                            }`}
                                    >
                                        QR справа
                                    </button>
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

                                <div className="space-y-2 border-t border-white/6 pt-3">
                                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Внутренние отступы</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="col-span-2 mx-auto w-full sm:w-[calc(50%-0.25rem)]">
                                            <NumericField
                                                compact
                                                label="Сверху, мм"
                                                value={settings.labelPaddingTopMm}
                                                step="0.1"
                                                onChange={(value) => updateNumericSetting('labelPaddingTopMm', value, 0, 20)}
                                            />
                                        </div>
                                        <NumericField
                                            compact
                                            label="Слева, мм"
                                            value={settings.labelPaddingLeftMm}
                                            step="0.1"
                                            onChange={(value) => updateNumericSetting('labelPaddingLeftMm', value, 0, 20)}
                                        />
                                        <NumericField
                                            compact
                                            label="Справа, мм"
                                            value={settings.labelPaddingRightMm}
                                            step="0.1"
                                            onChange={(value) => updateNumericSetting('labelPaddingRightMm', value, 0, 20)}
                                        />
                                        <div className="col-span-2 mx-auto w-full sm:w-[calc(50%-0.25rem)]">
                                            <NumericField
                                                compact
                                                label="Снизу, мм"
                                                value={settings.labelPaddingBottomMm}
                                                step="0.1"
                                                onChange={(value) => updateNumericSetting('labelPaddingBottomMm', value, 0, 20)}
                                            />
                                        </div>
                                    </div>
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

                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldSettingsDragEnd}>
                                <SortableContext items={settings.fieldOrder} strategy={verticalListSortingStrategy}>
                                    <div className="space-y-2">
                                        {settings.fieldOrder.map((fieldKey) => {
                                    const config = settings.fields[fieldKey];
                                    return (
                                        <SortableFieldSettingsCard
                                            key={fieldKey}
                                            fieldKey={fieldKey}
                                            config={config}
                                            onConfigChange={updateFieldConfig}
                                        />
                                    );
                                        })}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                    </section>
            </div>

        </div>
    );
}

function SortableFieldSettingsCard({
    fieldKey,
    config,
    onConfigChange
}: {
    fieldKey: QrFieldKey;
    config: QrFieldConfig;
    onConfigChange: (fieldKey: QrFieldKey, patch: Partial<QrFieldConfig>) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fieldKey });

    return (
        <div
            ref={setNodeRef}
            data-testid={`qr-field-settings-${fieldKey}`}
            className={`rounded-xl border border-white/6 bg-[#141821] p-3 ${isDragging ? 'opacity-70' : ''}`}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
        >
            <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-3 text-sm font-medium text-white">
                    <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(event) => onConfigChange(fieldKey, { enabled: event.target.checked })}
                        className="h-4 w-4 rounded border-gray-600 bg-[#11141a]"
                    />
                    {FIELD_LABELS[fieldKey]}
                </label>
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-lg border border-white/8 bg-white/[0.03] text-gray-400 transition hover:bg-white/[0.07] hover:text-white active:cursor-grabbing"
                        aria-label={`Переместить поле ${FIELD_LABELS[fieldKey]}`}
                    >
                        <GripVertical size={13} />
                    </button>
                </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <NumericField
                    compact
                    label="Размер, px"
                    value={config.fontSizePx}
                    onChange={(value) => onConfigChange(fieldKey, {
                        fontSizePx: clampNumber(value, 9, 40, config.fontSizePx)
                    })}
                />

                <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Жирность</span>
                    <select
                        value={String(config.fontWeight)}
                        onChange={(event) => onConfigChange(fieldKey, { fontWeight: Number(event.target.value) })}
                        className={`${QR_CONTROL_CLASS} h-10 px-3`}
                    >
                        {FONT_WEIGHT_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </label>

                <div className="sm:col-span-2">
                    <div className="mb-1.5 flex items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Отступы, мм:</span>
                        <div className="grid flex-1 grid-cols-2 gap-2">
                            <label className="block">
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Сверху</span>
                                <input
                                    type="number"
                                    value={config.spacingBeforeMm}
                                    step="0.1"
                                    onChange={(event) => onConfigChange(fieldKey, {
                                        spacingBeforeMm: clampNumber(event.target.value, 0, 20, config.spacingBeforeMm)
                                    })}
                                    className={`${QR_CONTROL_CLASS} h-8 px-2 text-xs`}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">Снизу</span>
                                <input
                                    type="number"
                                    value={config.spacingAfterMm}
                                    step="0.1"
                                    onChange={(event) => onConfigChange(fieldKey, {
                                        spacingAfterMm: clampNumber(event.target.value, 0, 20, config.spacingAfterMm)
                                    })}
                                    className={`${QR_CONTROL_CLASS} h-8 px-2 text-xs`}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <label className="block sm:col-span-2">
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Шрифт</span>
                    <select
                        value={config.fontFamily}
                        onChange={(event) => onConfigChange(fieldKey, { fontFamily: event.target.value })}
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
}

function NumericField({
    label,
    value,
    onChange,
    compact = false,
    step = '1'
}: {
    label: string;
    value: number;
    onChange: (value: string) => void;
    compact?: boolean;
    step?: string;
}) {
    return (
        <label className="block">
            <span className={`block font-semibold uppercase tracking-[0.18em] text-gray-500 ${compact ? 'mb-1.5 text-[11px]' : 'mb-2 text-xs'}`}>{label}</span>
            <input
                type="number"
                min="0"
                step={step}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={`${QR_CONTROL_CLASS} ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}
            />
        </label>
    );
}
