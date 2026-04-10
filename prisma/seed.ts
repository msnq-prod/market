import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_CLONE_PAGE_CONTENT } from '../src/shared/clonePageContent.ts';

const db = new PrismaClient();

const ADMIN_PASSWORD_HASH = '$2b$10$rHas7QKx6Bjsb8CHfOyxqey4Ei3Ir69F5SEG9ar07eBPN0Gisn0Xy'; // admin123
const DEFAULT_PASSWORD_HASH = '$2b$10$/vO6sqbVFEjs9IADUfQMr.xLkDVZF6FhypFOpig8hAzC0NAJWbagy'; // partner123

const now = new Date();
const daysAgo = (days: number, hour = 12) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date;
};

const isMissingContentPagesTable = (error: unknown) =>
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === 'P2021'
    && String(error.meta?.table ?? '') === 'content_pages';

async function seedLanguages() {
    const languages = [
        { id: 1, name: 'English', code: 'en', available: true, is_default: false },
        { id: 2, name: 'Русский', code: 'ru', available: true, is_default: true },
        { id: 3, name: 'Deutsch', code: 'de', available: false, is_default: false },
        { id: 4, name: '中文', code: 'zh', available: false, is_default: false },
        { id: 5, name: 'Français', code: 'fr', available: false, is_default: false },
    ];

    for (const language of languages) {
        await db.language.upsert({
            where: { id: language.id },
            update: {
                name: language.name,
                code: language.code,
                available: language.available,
                is_default: language.is_default,
            },
            create: language,
        });
    }
}

async function cleanupBusinessData() {
    await db.$transaction([
        db.orderItem.deleteMany(),
        db.order.deleteMany(),
        db.ledger.deleteMany(),
        db.auditLog.deleteMany(),
        db.videoProcessingJob.deleteMany(),
        db.batchVideoExportSession.deleteMany(),
        db.item.deleteMany(),
        db.batch.deleteMany(),
        db.collectionRequest.deleteMany(),
        db.productTranslation.deleteMany(),
        db.product.deleteMany(),
        db.locationTranslation.deleteMany(),
        db.location.deleteMany(),
        db.categoryTranslation.deleteMany(),
        db.category.deleteMany(),
        db.user.deleteMany(),
    ]);

    try {
        await db.contentPage.deleteMany({ where: { key: 'clone_page' } });
    } catch (error) {
        if (isMissingContentPagesTable(error)) {
            console.warn('Skip content page cleanup (table `content_pages` is missing).');
        } else {
            throw error;
        }
    }
}

async function seedUsers() {
    await db.user.createMany({
        data: [
            {
                id: 'usr-admin',
                name: 'Администратор HQ',
                email: 'admin@stones.com',
                password_hash: ADMIN_PASSWORD_HASH,
                role: 'ADMIN',
                balance: 0,
                details: { city: 'Москва', team: 'HQ' },
                created_at: daysAgo(200, 10),
            },
            {
                id: 'usr-manager',
                name: 'Складской менеджер',
                email: 'manager@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'MANAGER',
                balance: 0,
                details: { city: 'Москва', shift: 'A' },
                created_at: daysAgo(150, 11),
            },
            {
                id: 'usr-sales-manager',
                name: 'Менеджер продаж',
                email: 'sales@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'SALES_MANAGER',
                balance: 0,
                details: { city: 'Москва', channel: 'site-orders' },
                created_at: daysAgo(120, 10),
            },
            {
                id: 'usr-franchisee',
                name: 'Партнер Stones',
                email: 'yakutia.partner@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'FRANCHISEE',
                balance: 0,
                commission_rate: 10,
                details: { region: 'Якутия', shop: 'Пустой стартовый кабинет' },
                created_at: daysAgo(180, 9),
            },
            {
                id: 'usr-user',
                name: 'Тестовый покупатель',
                email: 'user@stones.com',
                username: 'user',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'USER',
                balance: 0,
                details: { city: 'Владивосток' },
                created_at: daysAgo(90, 14),
            },
        ],
    });
}

async function seedCategories() {
    await db.category.createMany({
        data: [
            {
                id: 'cat-stones',
                slug: 'stones'
            }
        ]
    });

    await db.categoryTranslation.createMany({
        data: [
            {
                id: 'cat-tr-stones-en',
                category_id: 'cat-stones',
                language_id: 1,
                name: 'Stones'
            },
            {
                id: 'cat-tr-stones-ru',
                category_id: 'cat-stones',
                language_id: 2,
                name: 'Камни'
            }
        ]
    });
}

async function seedClonePage() {
    try {
        await db.contentPage.create({
            data: {
                key: 'clone_page',
                data: DEFAULT_CLONE_PAGE_CONTENT,
            },
        });
    } catch (error) {
        if (isMissingContentPagesTable(error)) {
            console.warn('Skip clone page seed (table `content_pages` is missing).');
        } else {
            throw error;
        }
    }
}

async function main() {
    console.log('Seeding minimal database state...');

    await seedLanguages();
    await cleanupBusinessData();
    await seedUsers();
    await seedCategories();
    await seedClonePage();

    console.log('Minimal seed completed.');
    console.log('Users: 5 (ADMIN, MANAGER, SALES_MANAGER, FRANCHISEE, USER)');
    console.log('Categories: 1');
    console.log('Locations/products/orders/batches/items: 0');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await db.$disconnect();
    });
