import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const E2E_NOTE_PREFIX = '[e2e]';
const LEGACY_PARTNER_QR_COLLECTED_DATE = new Date('2026-04-10T00:00:00.000Z');
const SEEDED_LOCATION_IDS = ['loc-yakutia', 'loc-ural', 'loc-baltic', 'loc-altai', 'loc-kola'] as const;
const SEEDED_PRODUCT_IDS = [
    'prod-yak-001',
    'prod-yak-002',
    'prod-ural-001',
    'prod-ural-002',
    'prod-baltic-001',
    'prod-baltic-002',
    'prod-altai-001',
    'prod-altai-002',
    'prod-kola-001',
    'prod-kola-002',
] as const;

type CleanupOptions = {
    includeLegacyPartnerQrLeaks?: boolean;
    verbose?: boolean;
};

type CleanupSummary = {
    orderItems: number;
    orders: number;
    ledger: number;
    auditLogs: number;
    videoProcessingJobs: number;
    batchVideoExportSessions: number;
    items: number;
    batches: number;
    collectionRequests: number;
    productTranslations: number;
    products: number;
    locationTranslations: number;
    locations: number;
    categoryTranslations: number;
    categories: number;
    users: number;
};

const emptySummary = (): CleanupSummary => ({
    orderItems: 0,
    orders: 0,
    ledger: 0,
    auditLogs: 0,
    videoProcessingJobs: 0,
    batchVideoExportSessions: 0,
    items: 0,
    batches: 0,
    collectionRequests: 0,
    productTranslations: 0,
    products: 0,
    locationTranslations: 0,
    locations: 0,
    categoryTranslations: 0,
    categories: 0,
    users: 0,
});

const unique = <T>(values: T[]) => Array.from(new Set(values));

const hasValues = <T>(values: T[]): values is [T, ...T[]] => values.length > 0;

const legacyLocationPatterns: Prisma.LocationTranslationWhereInput[] = [
    { name: { startsWith: '[e2e] ' } },
    {
        name: { startsWith: 'Secured location ' },
        description: 'ACL test',
    },
    {
        name: { startsWith: 'Владивосток ' },
        description: 'Тест на soft delete локации',
    },
];

const legacyProductPatterns: Prisma.ProductTranslationWhereInput[] = [
    { name: { startsWith: '[e2e] ' } },
    {
        name: { startsWith: 'Secured product ' },
        description: 'ACL test',
    },
    {
        name: { startsWith: 'Товар ' },
        description: 'Тест на soft delete товара',
    },
];

const buyerUserWhere: Prisma.UserWhereInput = {
    OR: [
        { username: { startsWith: 'buyer-' } },
        { email: { contains: '@example.test' } },
        { email: { contains: '@edited.test' } },
    ],
};

export async function cleanupE2eArtifacts(options: CleanupOptions = {}): Promise<CleanupSummary> {
    const { includeLegacyPartnerQrLeaks = false, verbose = false } = options;
    const summary = emptySummary();

    const legacyLocationIds = unique((await prisma.locationTranslation.findMany({
        where: { OR: legacyLocationPatterns },
        select: { location_id: true },
    })).map((entry) => entry.location_id));

    const productRecords = await prisma.product.findMany({
        where: {
            OR: [
                { id: { startsWith: 'e2e-' } },
                legacyLocationIds.length > 0 ? { location_id: { in: legacyLocationIds } } : undefined,
                { translations: { some: { OR: legacyProductPatterns } } },
            ].filter(Boolean) as Prisma.ProductWhereInput[],
        },
        select: {
            id: true,
            location_id: true,
            category_id: true,
        },
    });

    const productIds = unique(productRecords.map((entry) => entry.id));
    const locationIds = unique([
        ...legacyLocationIds,
        ...productRecords.map((entry) => entry.location_id),
    ]);
    const categoryIds = unique(productRecords.map((entry) => entry.category_id).filter((id) => id.startsWith('e2e-')));

    const markedRequestWhere: Prisma.CollectionRequestWhereInput[] = [
        { note: { startsWith: E2E_NOTE_PREFIX } },
    ];

    if (hasValues(productIds)) {
        markedRequestWhere.push({ product_id: { in: productIds } });
    }

    if (includeLegacyPartnerQrLeaks) {
        markedRequestWhere.push({
            product_id: 'prod-yak-001',
            batch: {
                is: {
                    collected_date: LEGACY_PARTNER_QR_COLLECTED_DATE,
                },
            },
        });
    }

    const requestIds = unique((await prisma.collectionRequest.findMany({
        where: { OR: markedRequestWhere },
        select: { id: true },
    })).map((entry) => entry.id));

    const buyerUserIds = unique((await prisma.user.findMany({
        where: buyerUserWhere,
        select: { id: true },
    })).map((entry) => entry.id));

    const batchWhere: Prisma.BatchWhereInput[] = [
        { id: { startsWith: 'e2e-' } },
    ];

    if (hasValues(productIds)) {
        batchWhere.push({ product_id: { in: productIds } });
    }

    if (hasValues(requestIds)) {
        batchWhere.push({ collection_request_id: { in: requestIds } });
    }

    const batchIds = unique((await prisma.batch.findMany({
        where: { OR: batchWhere },
        select: { id: true },
    })).map((entry) => entry.id));

    const itemWhere: Prisma.ItemWhereInput[] = [
        { id: { startsWith: 'e2e-' } },
    ];

    if (hasValues(batchIds)) {
        itemWhere.push({ batch_id: { in: batchIds } });
    }

    if (hasValues(productIds)) {
        itemWhere.push({ product_id: { in: productIds } });
    }

    const itemIds = unique((await prisma.item.findMany({
        where: { OR: itemWhere },
        select: { id: true },
    })).map((entry) => entry.id));

    const orderWhere: Prisma.OrderWhereInput[] = [
        { id: { startsWith: 'e2e-' } },
    ];

    if (hasValues(buyerUserIds)) {
        orderWhere.push({ user_id: { in: buyerUserIds } });
    }

    const orderIds = unique((await prisma.order.findMany({
        where: { OR: orderWhere },
        select: { id: true },
    })).map((entry) => entry.id));

    if (hasValues(orderIds)) {
        summary.orderItems = (await prisma.orderItem.deleteMany({
            where: { order_id: { in: orderIds } },
        })).count;
    }

    if (hasValues(orderIds)) {
        summary.orders = (await prisma.order.deleteMany({
            where: { id: { in: orderIds } },
        })).count;
    }

    if (hasValues(itemIds) || hasValues(buyerUserIds)) {
        const ledgerOr: Prisma.LedgerWhereInput[] = [];

        if (hasValues(itemIds)) {
            ledgerOr.push({ item_id: { in: itemIds } });
        }

        if (hasValues(buyerUserIds)) {
            ledgerOr.push({ user_id: { in: buyerUserIds } });
        }

        summary.ledger = (await prisma.ledger.deleteMany({
            where: { OR: ledgerOr },
        })).count;
    }

    if (hasValues(buyerUserIds)) {
        summary.auditLogs = (await prisma.auditLog.deleteMany({
            where: { user_id: { in: buyerUserIds } },
        })).count;
    }

    if (hasValues(batchIds)) {
        summary.videoProcessingJobs = (await prisma.videoProcessingJob.deleteMany({
            where: { batch_id: { in: batchIds } },
        })).count;

        summary.batchVideoExportSessions = (await prisma.batchVideoExportSession.deleteMany({
            where: { batch_id: { in: batchIds } },
        })).count;
    }

    if (hasValues(itemIds)) {
        summary.items = (await prisma.item.deleteMany({
            where: { id: { in: itemIds } },
        })).count;
    }

    if (hasValues(batchIds)) {
        summary.batches = (await prisma.batch.deleteMany({
            where: { id: { in: batchIds } },
        })).count;
    }

    if (hasValues(requestIds)) {
        summary.collectionRequests = (await prisma.collectionRequest.deleteMany({
            where: { id: { in: requestIds } },
        })).count;
    }

    if (hasValues(productIds)) {
        summary.productTranslations = (await prisma.productTranslation.deleteMany({
            where: { product_id: { in: productIds } },
        })).count;

        summary.products = (await prisma.product.deleteMany({
            where: { id: { in: productIds } },
        })).count;
    }

    if (hasValues(locationIds)) {
        summary.locationTranslations = (await prisma.locationTranslation.deleteMany({
            where: { location_id: { in: locationIds } },
        })).count;

        summary.locations = (await prisma.location.deleteMany({
            where: { id: { in: locationIds } },
        })).count;
    }

    if (hasValues(categoryIds)) {
        summary.categoryTranslations = (await prisma.categoryTranslation.deleteMany({
            where: { category_id: { in: categoryIds } },
        })).count;

        summary.categories = (await prisma.category.deleteMany({
            where: { id: { in: categoryIds } },
        })).count;
    }

    if (hasValues(buyerUserIds)) {
        summary.users = (await prisma.user.deleteMany({
            where: { id: { in: buyerUserIds } },
        })).count;
    }

    if (verbose) {
        const totalDeleted = Object.values(summary).reduce((acc, count) => acc + count, 0);

        if (totalDeleted > 0) {
            console.log('[e2e-db-cleanup]', JSON.stringify(summary));
        }
    }

    return summary;
}

export async function disconnectE2eCleanupDb() {
    await prisma.$disconnect();
}

export async function restoreSeedCatalogState() {
    await prisma.location.updateMany({
        where: { id: { in: [...SEEDED_LOCATION_IDS] } },
        data: { deleted_at: null },
    });

    await prisma.product.updateMany({
        where: { id: { in: [...SEEDED_PRODUCT_IDS] } },
        data: { deleted_at: null },
    });
}
