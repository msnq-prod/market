import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

export const testDb = new PrismaClient();

const EN_LANGUAGE_ID = 1;
const RU_LANGUAGE_ID = 2;
const FRANCHISEE_EMAIL = 'yakutia.partner@stones.com';

type ProductFixtureOptions = {
    isPublished?: boolean;
    stockOnlineCount?: number;
    name?: string;
};

type CatalogFixtureBase = {
    suffix: string;
    categoryId: string;
    locationId: string;
    productId: string;
    locationCode: string;
    itemCode: string;
    name: string;
    description: string;
    ownerId: string;
};

const buildTranslationCreate = (name: string, description: string) => ([
    { language_id: EN_LANGUAGE_ID, name, description },
    { language_id: RU_LANGUAGE_ID, name, description },
]);

const getSeededFranchisee = async () => {
    const franchisee = await testDb.user.findUnique({
        where: { email: FRANCHISEE_EMAIL },
        select: { id: true },
    });

    if (!franchisee) {
        throw new Error(`Seeded franchisee ${FRANCHISEE_EMAIL} is required for e2e fixtures.`);
    }

    return franchisee;
};

async function createCatalogFixtureBase(name: string, description: string, isPublished: boolean): Promise<CatalogFixtureBase> {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const categoryId = `e2e-cat-${suffix}`;
    const locationId = `e2e-loc-${suffix}`;
    const productId = `e2e-prod-${suffix}`;
    const locationCode = suffix.slice(0, 3).toUpperCase();
    const itemCode = suffix.slice(3, 11).toUpperCase();
    const franchisee = await getSeededFranchisee();

    await testDb.category.create({
        data: {
            id: categoryId,
            slug: `e2e-${suffix}`,
            translations: {
                create: [
                    { language_id: EN_LANGUAGE_ID, name: 'E2E категория' },
                    { language_id: RU_LANGUAGE_ID, name: 'E2E категория' },
                ],
            },
        },
    });

    await testDb.location.create({
        data: {
            id: locationId,
            lat: 55.751244,
            lng: 37.618423,
            image: '/locations/crystal-caves.jpg',
            translations: {
                create: [
                    {
                        language_id: EN_LANGUAGE_ID,
                        name: 'E2E локация',
                        country: 'Россия',
                        description: 'Локация для автотестов',
                    },
                    {
                        language_id: RU_LANGUAGE_ID,
                        name: 'E2E локация',
                        country: 'Россия',
                        description: 'Локация для автотестов',
                    },
                ],
            },
        },
    });

    await testDb.product.create({
        data: {
            id: productId,
            price: 12345,
            image: '/locations/crystal-caves.jpg',
            location_id: locationId,
            category_id: categoryId,
            country_code: 'RUS',
            location_code: locationCode,
            item_code: itemCode,
            location_description: 'Тестовая локация для автотестов',
            is_published: isPublished,
            translations: {
                create: buildTranslationCreate(name, description),
            },
        },
    });

    return {
        suffix,
        categoryId,
        locationId,
        productId,
        locationCode,
        itemCode,
        name,
        description,
        ownerId: franchisee.id,
    };
}

export async function createProductFixture(options: ProductFixtureOptions = {}) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const batchId = `e2e-batch-${suffix}`;
    const name = options.name || `E2E товар ${suffix}`;
    const description = `Тестовый товар ${suffix}`;
    const stockOnlineCount = options.stockOnlineCount ?? 0;
    const isPublished = options.isPublished ?? true;

    const base = await createCatalogFixtureBase(name, description, isPublished);

    let createdBatchId: string | null = null;
    if (stockOnlineCount > 0) {
        createdBatchId = batchId;

        await testDb.batch.create({
            data: {
                id: batchId,
                owner_id: base.ownerId,
                product_id: base.productId,
                status: 'IN_STOCK',
                gps_lat: 55.751244,
                gps_lng: 37.618423,
                collected_date: new Date('2026-04-07T00:00:00.000Z'),
                collected_time: '12:00',
                daily_batch_seq: 1,
            },
        });

        await testDb.item.createMany({
            data: Array.from({ length: stockOnlineCount }, (_item, index) => ({
                id: `e2e-item-${suffix}-${index + 1}`,
                batch_id: batchId,
                product_id: base.productId,
                temp_id: String(index + 1).padStart(3, '0'),
                public_token: `e2e-token-${suffix}-${index + 1}`,
                item_seq: index + 1,
                photo_url: '/locations/crystal-caves.jpg',
                status: 'STOCK_ONLINE',
                is_sold: false,
            })),
        });
    }

    return {
        categoryId: base.categoryId,
        locationId: base.locationId,
        productId: base.productId,
        batchId: createdBatchId,
        ownerId: base.ownerId,
    };
}

export async function createFinalizeReadyFixture() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const name = `Finalize товар ${suffix}`;
    const description = `Партия для finalize ${suffix}`;
    const base = await createCatalogFixtureBase(name, description, true);
    const batchId = `e2e-finalize-batch-${suffix}`;
    const itemId = `e2e-finalize-item-${suffix}`;

    await testDb.batch.create({
        data: {
            id: batchId,
            owner_id: base.ownerId,
            product_id: base.productId,
            status: 'RECEIVED',
            gps_lat: 55.751244,
            gps_lng: 37.618423,
            collected_date: new Date('2026-04-07T00:00:00.000Z'),
            collected_time: '12:00',
            daily_batch_seq: 1,
        },
    });

    const serialFamily = `RUS${base.locationCode}${base.itemCode}070426`;
    await testDb.item.create({
        data: {
            id: itemId,
            batch_id: batchId,
            product_id: base.productId,
            temp_id: '001',
            public_token: `e2e-finalize-token-${suffix}`,
            serial_number: `${serialFamily}001`,
            item_seq: 1,
            photo_url: '/locations/crystal-caves.jpg',
            item_photo_url: '/locations/crystal-caves.jpg',
            item_video_url: '/uploads/videos/mock.mp4',
            status: 'NEW',
            is_sold: false,
            collected_date: new Date('2026-04-07T00:00:00.000Z'),
            collected_time: '12:00',
        },
    });

    return {
        batchId,
        itemId,
        productId: base.productId,
        locationId: base.locationId,
        productName: name,
    };
}

export async function createWarehouseFixture() {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const productName = `Склад E2E ${suffix}`;
    const description = `Складской товар ${suffix}`;
    const base = await createCatalogFixtureBase(productName, description, true);
    const firstBatchId = `e2e-wh-batch-a-${suffix}`;
    const secondBatchId = `e2e-wh-batch-b-${suffix}`;
    const legacyBatchId = `e2e-wh-legacy-${suffix}`;
    const serialFamily = `RUS${base.locationCode}${base.itemCode}080426`;
    const updatedTempId = `EDIT-${suffix}`;

    await testDb.batch.createMany({
        data: [
            {
                id: firstBatchId,
                owner_id: base.ownerId,
                product_id: base.productId,
                status: 'IN_STOCK',
                gps_lat: 55.751244,
                gps_lng: 37.618423,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '09:00',
                daily_batch_seq: 1,
            },
            {
                id: secondBatchId,
                owner_id: base.ownerId,
                product_id: base.productId,
                status: 'IN_STOCK',
                gps_lat: 55.751244,
                gps_lng: 37.618423,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '11:00',
                daily_batch_seq: 1,
            },
            {
                id: legacyBatchId,
                owner_id: base.ownerId,
                product_id: null,
                status: 'IN_STOCK',
                gps_lat: 55.751244,
                gps_lng: 37.618423,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '14:00',
                daily_batch_seq: 1,
            }
        ],
    });

    const editableItemId = `e2e-wh-item-edit-${suffix}`;
    await testDb.item.createMany({
        data: [
            {
                id: editableItemId,
                batch_id: firstBatchId,
                product_id: base.productId,
                temp_id: '001',
                public_token: `e2e-wh-token-edit-${suffix}`,
                serial_number: `${serialFamily}001`,
                item_seq: 1,
                photo_url: '/locations/crystal-caves.jpg',
                item_photo_url: '/locations/crystal-caves.jpg',
                item_video_url: '/uploads/videos/mock.mp4',
                status: 'STOCK_HQ',
                is_sold: false,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '09:00',
            },
            {
                id: `e2e-wh-item-online-${suffix}`,
                batch_id: firstBatchId,
                product_id: base.productId,
                temp_id: '002',
                public_token: `e2e-wh-token-online-${suffix}`,
                serial_number: `${serialFamily}002`,
                item_seq: 2,
                photo_url: '/locations/crystal-caves.jpg',
                item_photo_url: '/locations/crystal-caves.jpg',
                item_video_url: '/uploads/videos/mock.mp4',
                status: 'STOCK_ONLINE',
                is_sold: false,
                sales_channel: 'MARKETPLACE',
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '09:00',
            },
            {
                id: `e2e-wh-item-consign-${suffix}`,
                batch_id: secondBatchId,
                product_id: base.productId,
                temp_id: '003',
                public_token: `e2e-wh-token-consign-${suffix}`,
                serial_number: `${serialFamily}003`,
                item_seq: 3,
                photo_url: '/locations/crystal-caves.jpg',
                item_photo_url: '/locations/crystal-caves.jpg',
                item_video_url: '/uploads/videos/mock.mp4',
                status: 'ON_CONSIGNMENT',
                is_sold: false,
                sales_channel: 'OFFLINE_POINT',
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '11:00',
            },
            {
                id: `e2e-wh-item-sold-${suffix}`,
                batch_id: secondBatchId,
                product_id: base.productId,
                temp_id: '004',
                public_token: `e2e-wh-token-sold-${suffix}`,
                serial_number: `${serialFamily}004`,
                item_seq: 4,
                photo_url: '/locations/crystal-caves.jpg',
                item_photo_url: '/locations/crystal-caves.jpg',
                item_video_url: '/uploads/videos/mock.mp4',
                status: 'ACTIVATED',
                is_sold: true,
                sales_channel: 'MARKETPLACE',
                activation_date: new Date('2026-04-08T10:30:00.000Z'),
                price_sold: 15000,
                commission_hq: 1200,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '11:00',
            },
            {
                id: `e2e-wh-item-legacy-${suffix}`,
                batch_id: legacyBatchId,
                product_id: null,
                temp_id: 'LEG-001',
                public_token: `e2e-wh-token-legacy-${suffix}`,
                serial_number: null,
                item_seq: 1,
                photo_url: '/locations/crystal-caves.jpg',
                item_photo_url: '/locations/crystal-caves.jpg',
                item_video_url: '/uploads/videos/mock.mp4',
                status: 'STOCK_HQ',
                is_sold: false,
                collected_date: new Date('2026-04-08T00:00:00.000Z'),
                collected_time: '14:00',
            }
        ],
    });

    return {
        productName,
        locationName: 'E2E локация',
        serialFamily,
        firstBatchId,
        secondBatchId,
        legacyBatchId,
        editableItemId,
        updatedTempId,
    };
}

export async function disconnectTestDb() {
    await testDb.$disconnect();
}
