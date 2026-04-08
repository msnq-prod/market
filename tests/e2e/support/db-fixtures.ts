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

const buildTranslationCreate = (name: string, description: string) => ([
    { language_id: EN_LANGUAGE_ID, name, description },
    { language_id: RU_LANGUAGE_ID, name, description },
]);

export async function createProductFixture(options: ProductFixtureOptions = {}) {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const categoryId = `e2e-cat-${suffix}`;
    const locationId = `e2e-loc-${suffix}`;
    const productId = `e2e-prod-${suffix}`;
    const batchId = `e2e-batch-${suffix}`;
    const locationCode = suffix.slice(0, 3).toUpperCase();
    const itemCode = suffix.slice(3, 11).toUpperCase();
    const name = options.name || `E2E товар ${suffix}`;
    const description = `Тестовый товар ${suffix}`;
    const stockOnlineCount = options.stockOnlineCount ?? 0;
    const isPublished = options.isPublished ?? true;

    const franchisee = await testDb.user.findUnique({
        where: { email: FRANCHISEE_EMAIL },
        select: { id: true },
    });

    if (!franchisee) {
        throw new Error(`Seeded franchisee ${FRANCHISEE_EMAIL} is required for e2e fixtures.`);
    }

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

    let createdBatchId: string | null = null;
    if (stockOnlineCount > 0) {
        createdBatchId = batchId;

        await testDb.batch.create({
            data: {
                id: batchId,
                owner_id: franchisee.id,
                product_id: productId,
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
                product_id: productId,
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
        categoryId,
        locationId,
        productId,
        batchId: createdBatchId,
        ownerId: franchisee.id,
    };
}

export async function disconnectTestDb() {
    await testDb.$disconnect();
}
