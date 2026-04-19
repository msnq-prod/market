import { Prisma, PrismaClient } from '@prisma/client';
import { buildSerialNumber } from '../server/utils/collectionWorkflow.ts';
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
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2021' &&
    String(error.meta?.table ?? '') === 'content_pages';

const tableExists = async (tableName: string) => {
    const rows = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS count
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
    `);

    return Number(rows[0]?.count ?? 0) > 0;
};

const deleteAllFromTableIfExists = async (tableName: string) => {
    if (!(await tableExists(tableName))) {
        return;
    }

    await db.$executeRawUnsafe(`DELETE FROM \`${tableName}\``);
};

async function main() {
    console.log('Start seeding realistic RU test database...');

    // 1) Languages
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

    const enId = 1;
    const ruId = 2;

    // 2) Clean business data for deterministic test state
    await deleteAllFromTableIfExists('video_processing_jobs');
    await deleteAllFromTableIfExists('batch_video_export_sessions');

    await db.$transaction([
        db.authSession.deleteMany(),
        db.orderStatusEvent.deleteMany(),
        db.orderShipment.deleteMany(),
        db.orderItemAssignment.deleteMany(),
        db.orderItem.deleteMany(),
        db.order.deleteMany(),
        db.ledger.deleteMany(),
        db.auditLog.deleteMany(),
        db.item.deleteMany(),
        db.batch.deleteMany(),
        db.productTranslation.deleteMany(),
        db.product.deleteMany(),
        db.locationTranslation.deleteMany(),
        db.location.deleteMany(),
        db.categoryTranslation.deleteMany(),
        db.category.deleteMany(),
        db.collectionRequest.deleteMany(),
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

    // 3) Categories (Russian naming for both visible languages in test UI)
    const categories = [
        { id: 'cat-raw-stones', slug: 'raw-stones', name: 'Сырьевые камни' },
        { id: 'cat-polished', slug: 'polished-gems', name: 'Ограненные самоцветы' },
        { id: 'cat-amber', slug: 'amber-fossils', name: 'Янтарь и включения' },
        { id: 'cat-jewelry', slug: 'jewelry', name: 'Ювелирные изделия' },
        { id: 'cat-sets', slug: 'collector-sets', name: 'Коллекционные наборы' },
    ];

    for (const category of categories) {
        await db.category.create({
            data: {
                id: category.id,
                slug: category.slug,
                translations: {
                    create: [
                        { language_id: enId, name: category.name },
                        { language_id: ruId, name: category.name },
                    ],
                },
            },
        });
    }

    // 4) Locations
    const locations = [
        {
            id: 'loc-yakutia',
            lat: 62.5353,
            lng: 113.9611,
            image: '/locations/crystal-caves.jpg',
            name: 'Карьер «Мирный», Якутия',
            country: 'Россия',
            description: 'Алмазный карьер с промышленной добычей и сортировкой камня.',
        },
        {
            id: 'loc-ural',
            lat: 56.8389,
            lng: 60.6057,
            image: '/locations/moscow-market.jpg',
            name: 'Екатеринбург, Уральские мастерские',
            country: 'Россия',
            description: 'Центр огранки малахита, горного хрусталя и редких минералов.',
        },
        {
            id: 'loc-baltic',
            lat: 54.7104,
            lng: 20.4522,
            image: '/locations/kyoto-village.jpg',
            name: 'Калининград, Янтарный берег',
            country: 'Россия',
            description: 'Побережье Балтики с промышленной добычей янтаря.',
        },
        {
            id: 'loc-altai',
            lat: 51.9581,
            lng: 85.9603,
            image: '/locations/himalayan-peaks.jpg',
            name: 'Алтай, Чуйский тракт',
            country: 'Россия',
            description: 'Горные россыпи кварца и халцедона коллекционного качества.',
        },
        {
            id: 'loc-kola',
            lat: 67.6141,
            lng: 33.6737,
            image: '/locations/amazon-rainforest.jpg',
            name: 'Кольский полуостров, Хибины',
            country: 'Россия',
            description: 'Северные месторождения апатита и редкоземельных минералов.',
        },
    ];

    for (const location of locations) {
        await db.location.create({
            data: {
                id: location.id,
                lat: location.lat,
                lng: location.lng,
                image: location.image,
                translations: {
                    create: [
                        {
                            language_id: enId,
                            name: location.name,
                            country: location.country,
                            description: location.description,
                        },
                        {
                            language_id: ruId,
                            name: location.name,
                            country: location.country,
                            description: location.description,
                        },
                    ],
                },
            },
        });
    }

    // 5) Products
    const products = [
        {
            id: 'prod-yak-001',
            price: 185000,
            image: 'https://picsum.photos/seed/prod-yak-001/640/480',
            location_id: 'loc-yakutia',
            category_id: 'cat-polished',
            country_code: 'RUS',
            location_code: 'YAK',
            item_code: 'ALMZ001',
            name: 'Алмазный кристалл «Северное сияние»',
            description: 'Крупный прозрачный кристалл с лабораторной проверкой чистоты.',
        },
        {
            id: 'prod-yak-002',
            price: 32000,
            image: 'https://picsum.photos/seed/prod-yak-002/640/480',
            location_id: 'loc-yakutia',
            category_id: 'cat-sets',
            country_code: 'RUS',
            location_code: 'YAK',
            item_code: 'KIMB002',
            name: 'Набор кимберлитов «Якутская глубина»',
            description: 'Серия образцов кимберлита для коллекционеров и экспозиций.',
        },
        {
            id: 'prod-ural-001',
            price: 24800,
            image: 'https://picsum.photos/seed/prod-ural-001/640/480',
            location_id: 'loc-ural',
            category_id: 'cat-jewelry',
            country_code: 'RUS',
            location_code: 'URA',
            item_code: 'MALA001',
            name: 'Малахитовая шкатулка «Уральский узор»',
            description: 'Ручная работа из уральского малахита с латунной фурнитурой.',
        },
        {
            id: 'prod-ural-002',
            price: 7600,
            image: 'https://picsum.photos/seed/prod-ural-002/640/480',
            location_id: 'loc-ural',
            category_id: 'cat-raw-stones',
            country_code: 'RUS',
            location_code: 'URA',
            item_code: 'CRYS002',
            name: 'Горный хрусталь «Чистая грань»',
            description: 'Натуральный кристалл хрусталя в сырьевом виде.',
        },
        {
            id: 'prod-baltic-001',
            price: 41200,
            image: 'https://picsum.photos/seed/prod-baltic-001/640/480',
            location_id: 'loc-baltic',
            category_id: 'cat-amber',
            country_code: 'RUS',
            location_code: 'BAL',
            item_code: 'AMBR001',
            name: 'Янтарь с включением «Балтийская капля»',
            description: 'Фрагмент янтаря с сохраненной древней органикой.',
        },
        {
            id: 'prod-baltic-002',
            price: 17900,
            image: 'https://picsum.photos/seed/prod-baltic-002/640/480',
            location_id: 'loc-baltic',
            category_id: 'cat-jewelry',
            country_code: 'RUS',
            location_code: 'BAL',
            item_code: 'BUSY002',
            name: 'Бусы «Свет Балтики»',
            description: 'Полированная янтарная нить с серебряной застежкой.',
        },
        {
            id: 'prod-altai-001',
            price: 22600,
            image: 'https://picsum.photos/seed/prod-altai-001/640/480',
            location_id: 'loc-altai',
            category_id: 'cat-polished',
            country_code: 'RUS',
            location_code: 'ALT',
            item_code: 'CHAL001',
            name: 'Халцедон «Голубой Алтай»',
            description: 'Ограненный халцедон с ровной геометрией фасетов.',
        },
        {
            id: 'prod-altai-002',
            price: 11800,
            image: 'https://picsum.photos/seed/prod-altai-002/640/480',
            location_id: 'loc-altai',
            category_id: 'cat-sets',
            country_code: 'RUS',
            location_code: 'ALT',
            item_code: 'QUAR002',
            name: 'Набор кварца «Алтайский горизонт»',
            description: 'Три образца кварца разных оттенков для частной коллекции.',
        },
        {
            id: 'prod-kola-001',
            price: 9800,
            image: 'https://picsum.photos/seed/prod-kola-001/640/480',
            location_id: 'loc-kola',
            category_id: 'cat-raw-stones',
            country_code: 'RUS',
            location_code: 'KOL',
            item_code: 'APAT001',
            name: 'Апатит «Полярный лед»',
            description: 'Северный апатит с высоким содержанием фосфатов.',
        },
        {
            id: 'prod-kola-002',
            price: 26800,
            image: 'https://picsum.photos/seed/prod-kola-002/640/480',
            location_id: 'loc-kola',
            category_id: 'cat-polished',
            country_code: 'RUS',
            location_code: 'KOL',
            item_code: 'EUDI002',
            name: 'Эвдиалит «Северный рубин»',
            description: 'Ограненный эвдиалит с насыщенным винным оттенком.',
        },
    ];

    for (const product of products) {
        await db.product.create({
            data: {
                id: product.id,
                price: product.price,
                image: product.image,
                location_id: product.location_id,
                category_id: product.category_id,
                country_code: product.country_code,
                location_code: product.location_code,
                item_code: product.item_code,
                translations: {
                    create: [
                        {
                            language_id: enId,
                            name: product.name,
                            description: product.description,
                        },
                        {
                            language_id: ruId,
                            name: product.name,
                            description: product.description,
                        },
                    ],
                },
            },
        });
    }

    const productsById = new Map(products.map((product) => [product.id, product]));

    // 6) Users
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
                id: 'usr-fr-yakutia',
                name: 'ИП Петров / Якутия',
                email: 'yakutia.partner@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'FRANCHISEE',
                balance: 167000,
                commission_rate: 12.5,
                details: { region: 'Якутия', shop: 'Полярная витрина' },
                created_at: daysAgo(180, 9),
            },
            {
                id: 'usr-fr-ural',
                name: 'ООО УралМинерал',
                email: 'ural.partner@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'FRANCHISEE',
                balance: 118000,
                commission_rate: 10,
                details: { region: 'Свердловская область', shop: 'Уральский ряд' },
                created_at: daysAgo(170, 9),
            },
            {
                id: 'usr-fr-baltic',
                name: 'ИП Балтика Янтарь',
                email: 'baltic.partner@stones.com',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'FRANCHISEE',
                balance: 70500,
                commission_rate: 9,
                details: { region: 'Калининград', shop: 'Янтарный квартал' },
                created_at: daysAgo(165, 9),
            },
            {
                id: 'usr-cust-anna',
                name: 'Анна Смирнова',
                email: 'anna.smirnova@example.ru',
                username: 'anna',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'USER',
                balance: 0,
                details: { city: 'Казань' },
                created_at: daysAgo(90, 14),
            },
            {
                id: 'usr-cust-maxim',
                name: 'Максим Лебедев',
                email: 'maxim.lebedev@example.ru',
                username: 'maxim',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'USER',
                balance: 0,
                details: { city: 'Новосибирск' },
                created_at: daysAgo(70, 16),
            },
            {
                id: 'usr-cust-olga',
                name: 'Ольга Кузнецова',
                email: 'olga.kuznetsova@example.ru',
                username: 'olga',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'USER',
                balance: 0,
                details: { city: 'Санкт-Петербург' },
                created_at: daysAgo(60, 13),
            },
            {
                id: 'usr-cust-kirill',
                name: 'Кирилл Волков',
                email: 'kirill.volkov@example.ru',
                username: 'kirill',
                password_hash: DEFAULT_PASSWORD_HASH,
                role: 'USER',
                balance: 0,
                details: { city: 'Краснодар' },
                created_at: daysAgo(45, 15),
            },
        ],
    });

    // 7) Batches + items (already active operational lifecycle)
    const batchSeeds = [
        {
            id: 'batch-yak-2026-01',
            owner_id: 'usr-fr-yakutia',
            product_id: 'prod-yak-001',
            status: 'FINISHED' as const,
            video_url: '/uploads/videos/yakutia-2026-01.mp4',
            gps_lat: 62.5353,
            gps_lng: 113.9611,
            collected_date: daysAgo(48, 10),
            collected_time: '10:00',
            daily_batch_seq: 1,
            created_at: daysAgo(48, 10),
            items: [
                {
                    id: 'item-yak-001',
                    temp_id: 'ЯК-001',
                    photo_url: 'https://picsum.photos/seed/item-yak-001/600/600',
                    item_photo_url: '/locations/crystal-caves.jpg',
                    item_video_url: '/uploads/videos/items/yak-001.mp4',
                    status: 'ACTIVATED' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    activation_date: daysAgo(20, 14),
                    price_sold: 185000,
                    commission_hq: 28000,
                    created_at: daysAgo(47, 10),
                },
                {
                    id: 'item-yak-002',
                    temp_id: 'ЯК-002',
                    photo_url: 'https://picsum.photos/seed/item-yak-002/600/600',
                    item_photo_url: '/locations/crystal-caves.jpg',
                    status: 'STOCK_ONLINE' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    price_sold: 92000,
                    commission_hq: 13800,
                    created_at: daysAgo(47, 11),
                },
                {
                    id: 'item-yak-003',
                    temp_id: 'ЯК-003',
                    photo_url: 'https://picsum.photos/seed/item-yak-003/600/600',
                    status: 'ON_CONSIGNMENT' as const,
                    sales_channel: 'OFFLINE_POINT' as const,
                    created_at: daysAgo(46, 9),
                },
                {
                    id: 'item-yak-004',
                    temp_id: 'ЯК-004',
                    photo_url: 'https://picsum.photos/seed/item-yak-004/600/600',
                    status: 'STOCK_HQ' as const,
                    created_at: daysAgo(46, 11),
                },
                {
                    id: 'item-yak-005',
                    temp_id: 'ЯК-005',
                    photo_url: 'https://picsum.photos/seed/item-yak-005/600/600',
                    status: 'REJECTED' as const,
                    created_at: daysAgo(46, 12),
                },
                {
                    id: 'item-yak-006',
                    temp_id: 'ЯК-006',
                    photo_url: 'https://picsum.photos/seed/item-yak-006/600/600',
                    item_photo_url: '/locations/crystal-caves.jpg',
                    item_video_url: '/uploads/videos/items/yak-006.mp4',
                    status: 'ACTIVATED' as const,
                    sales_channel: 'OFFLINE_POINT' as const,
                    activation_date: daysAgo(28, 18),
                    price_sold: 54000,
                    commission_hq: 8100,
                    created_at: daysAgo(45, 10),
                },
            ],
        },
        {
            id: 'batch-yak-2026-02',
            owner_id: 'usr-fr-yakutia',
            product_id: 'prod-yak-002',
            status: 'TRANSIT' as const,
            video_url: '/uploads/videos/yakutia-2026-02.mp4',
            gps_lat: 63.02,
            gps_lng: 112.45,
            collected_date: daysAgo(7, 8),
            collected_time: '08:00',
            daily_batch_seq: 1,
            created_at: daysAgo(7, 8),
            items: [
                {
                    id: 'item-yak-101',
                    temp_id: 'ЯК-Т-101',
                    photo_url: 'https://picsum.photos/seed/item-yak-101/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(7, 9),
                },
                {
                    id: 'item-yak-102',
                    temp_id: 'ЯК-Т-102',
                    photo_url: 'https://picsum.photos/seed/item-yak-102/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(7, 10),
                },
                {
                    id: 'item-yak-103',
                    temp_id: 'ЯК-Т-103',
                    photo_url: 'https://picsum.photos/seed/item-yak-103/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(7, 11),
                },
                {
                    id: 'item-yak-104',
                    temp_id: 'ЯК-Т-104',
                    photo_url: 'https://picsum.photos/seed/item-yak-104/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(7, 12),
                },
            ],
        },
        {
            id: 'batch-ural-2026-03',
            owner_id: 'usr-fr-ural',
            product_id: 'prod-ural-002',
            status: 'TRANSIT' as const,
            video_url: '/uploads/videos/ural-2026-03.mp4',
            gps_lat: 57.22,
            gps_lng: 59.96,
            collected_date: daysAgo(2, 13),
            collected_time: '13:00',
            daily_batch_seq: 1,
            created_at: daysAgo(2, 13),
            items: [
                {
                    id: 'item-ural-101',
                    temp_id: 'УР-101',
                    photo_url: 'https://picsum.photos/seed/item-ural-101/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(2, 13),
                },
                {
                    id: 'item-ural-102',
                    temp_id: 'УР-102',
                    photo_url: 'https://picsum.photos/seed/item-ural-102/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(2, 14),
                },
                {
                    id: 'item-ural-103',
                    temp_id: 'УР-103',
                    photo_url: 'https://picsum.photos/seed/item-ural-103/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(2, 15),
                },
            ],
        },
        {
            id: 'batch-ural-2026-01',
            owner_id: 'usr-fr-ural',
            product_id: 'prod-ural-001',
            status: 'FINISHED' as const,
            video_url: '/uploads/videos/ural-2026-01.mp4',
            gps_lat: 56.8389,
            gps_lng: 60.6057,
            collected_date: daysAgo(34, 9),
            collected_time: '09:00',
            daily_batch_seq: 1,
            created_at: daysAgo(34, 9),
            items: [
                {
                    id: 'item-ural-201',
                    temp_id: 'УР-201',
                    photo_url: 'https://picsum.photos/seed/item-ural-201/600/600',
                    item_photo_url: '/locations/moscow-market.jpg',
                    item_video_url: '/uploads/videos/items/ural-201.mp4',
                    status: 'ACTIVATED' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    activation_date: daysAgo(12, 16),
                    price_sold: 126000,
                    commission_hq: 18900,
                    created_at: daysAgo(33, 10),
                },
                {
                    id: 'item-ural-202',
                    temp_id: 'УР-202',
                    photo_url: 'https://picsum.photos/seed/item-ural-202/600/600',
                    status: 'STOCK_HQ' as const,
                    created_at: daysAgo(33, 11),
                },
                {
                    id: 'item-ural-203',
                    temp_id: 'УР-203',
                    photo_url: 'https://picsum.photos/seed/item-ural-203/600/600',
                    status: 'STOCK_ONLINE' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    price_sold: 88000,
                    commission_hq: 13200,
                    created_at: daysAgo(33, 12),
                },
                {
                    id: 'item-ural-204',
                    temp_id: 'УР-204',
                    photo_url: 'https://picsum.photos/seed/item-ural-204/600/600',
                    status: 'REJECTED' as const,
                    created_at: daysAgo(32, 9),
                },
                {
                    id: 'item-ural-205',
                    temp_id: 'УР-205',
                    photo_url: 'https://picsum.photos/seed/item-ural-205/600/600',
                    status: 'SOLD_ONLINE' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    price_sold: 64000,
                    commission_hq: 9600,
                    created_at: daysAgo(32, 11),
                },
            ],
        },
        {
            id: 'batch-baltic-2026-01',
            owner_id: 'usr-fr-baltic',
            product_id: 'prod-baltic-001',
            status: 'FINISHED' as const,
            video_url: '/uploads/videos/baltic-2026-01.mp4',
            gps_lat: 54.7104,
            gps_lng: 20.4522,
            collected_date: daysAgo(30, 10),
            collected_time: '10:00',
            daily_batch_seq: 1,
            created_at: daysAgo(30, 10),
            items: [
                {
                    id: 'item-baltic-301',
                    temp_id: 'БЛ-301',
                    photo_url: 'https://picsum.photos/seed/item-baltic-301/600/600',
                    item_photo_url: '/locations/kyoto-village.jpg',
                    item_video_url: '/uploads/videos/items/baltic-301.mp4',
                    status: 'ACTIVATED' as const,
                    sales_channel: 'MARKETPLACE' as const,
                    activation_date: daysAgo(10, 12),
                    price_sold: 76000,
                    commission_hq: 11400,
                    created_at: daysAgo(29, 10),
                },
                {
                    id: 'item-baltic-302',
                    temp_id: 'БЛ-302',
                    photo_url: 'https://picsum.photos/seed/item-baltic-302/600/600',
                    status: 'ACTIVATED' as const,
                    sales_channel: 'OFFLINE_POINT' as const,
                    activation_date: daysAgo(9, 19),
                    price_sold: 39000,
                    commission_hq: 5900,
                    created_at: daysAgo(29, 11),
                },
                {
                    id: 'item-baltic-303',
                    temp_id: 'БЛ-303',
                    photo_url: 'https://picsum.photos/seed/item-baltic-303/600/600',
                    status: 'ON_CONSIGNMENT' as const,
                    sales_channel: 'OFFLINE_POINT' as const,
                    created_at: daysAgo(29, 12),
                },
                {
                    id: 'item-baltic-304',
                    temp_id: 'БЛ-304',
                    photo_url: 'https://picsum.photos/seed/item-baltic-304/600/600',
                    status: 'REJECTED' as const,
                    created_at: daysAgo(28, 9),
                },
            ],
        },
        {
            id: 'batch-baltic-2026-02',
            owner_id: 'usr-fr-baltic',
            product_id: 'prod-baltic-002',
            status: 'ERROR' as const,
            video_url: '/uploads/videos/baltic-2026-02.mp4',
            gps_lat: 54.95,
            gps_lng: 20.1,
            collected_date: daysAgo(10, 10),
            collected_time: '10:00',
            daily_batch_seq: 1,
            created_at: daysAgo(10, 10),
            items: [
                {
                    id: 'item-baltic-401',
                    temp_id: 'БЛ-401',
                    photo_url: 'https://picsum.photos/seed/item-baltic-401/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(10, 11),
                },
                {
                    id: 'item-baltic-402',
                    temp_id: 'БЛ-402',
                    photo_url: 'https://picsum.photos/seed/item-baltic-402/600/600',
                    status: 'NEW' as const,
                    created_at: daysAgo(10, 12),
                },
            ],
        },
        {
            id: 'batch-ural-2026-02',
            owner_id: 'usr-fr-ural',
            product_id: 'prod-ural-002',
            status: 'RECEIVED' as const,
            video_url: '/uploads/videos/ural-2026-02.mp4',
            gps_lat: 57.0,
            gps_lng: 60.2,
            collected_date: daysAgo(16, 8),
            collected_time: '08:00',
            daily_batch_seq: 1,
            created_at: daysAgo(16, 8),
            items: [
                {
                    id: 'item-ural-301',
                    temp_id: 'УР-301',
                    photo_url: 'https://picsum.photos/seed/item-ural-301/600/600',
                    item_photo_url: '/locations/moscow-market.jpg',
                    item_video_url: '/uploads/videos/items/ural-301.mp4',
                    status: 'STOCK_HQ' as const,
                    created_at: daysAgo(16, 9),
                },
                {
                    id: 'item-ural-302',
                    temp_id: 'УР-302',
                    photo_url: 'https://picsum.photos/seed/item-ural-302/600/600',
                    item_photo_url: '/locations/moscow-market.jpg',
                    status: 'STOCK_HQ' as const,
                    created_at: daysAgo(16, 10),
                },
                {
                    id: 'item-ural-303',
                    temp_id: 'УР-303',
                    photo_url: 'https://picsum.photos/seed/item-ural-303/600/600',
                    status: 'REJECTED' as const,
                    created_at: daysAgo(16, 11),
                },
            ],
        },
    ];

    for (const batch of batchSeeds) {
        const product = productsById.get(batch.product_id);
        if (!product) {
            throw new Error(`Seed batch ${batch.id} references unknown product ${batch.product_id}.`);
        }

        await db.batch.create({
            data: {
                id: batch.id,
                owner_id: batch.owner_id,
                product_id: batch.product_id,
                status: batch.status,
                video_url: batch.video_url,
                gps_lat: batch.gps_lat,
                gps_lng: batch.gps_lng,
                collected_date: batch.collected_date,
                collected_time: batch.collected_time,
                daily_batch_seq: batch.daily_batch_seq,
                created_at: batch.created_at,
                items: {
                    create: batch.items.map((item, index) => {
                        const serialNumber = buildSerialNumber(
                            product,
                            batch.collected_date,
                            index + 1,
                            batch.daily_batch_seq
                        );

                        return {
                            ...item,
                            serial_number: serialNumber,
                            product_id: batch.product_id,
                            item_seq: index + 1,
                            collected_date: batch.collected_date,
                            collected_time: batch.collected_time
                        };
                    }),
                },
            },
        });
    }

    // 8) Ledger
    await db.ledger.createMany({
        data: [
            {
                id: 'ledger-yak-001',
                user_id: 'usr-fr-yakutia',
                item_id: 'item-yak-001',
                operation: 'SALES_PAYOUT',
                amount: 185000,
                timestamp: daysAgo(20, 14),
            },
            {
                id: 'ledger-yak-002',
                user_id: 'usr-fr-yakutia',
                item_id: 'item-yak-006',
                operation: 'ROYALTY_CHARGE',
                amount: -15000,
                timestamp: daysAgo(28, 19),
            },
            {
                id: 'ledger-yak-003',
                user_id: 'usr-fr-yakutia',
                operation: 'MANUAL_ADJ',
                amount: 5000,
                timestamp: daysAgo(14, 11),
            },
            {
                id: 'ledger-yak-004',
                user_id: 'usr-fr-yakutia',
                operation: 'WITHDRAWAL',
                amount: -8000,
                timestamp: daysAgo(7, 13),
            },
            {
                id: 'ledger-ural-001',
                user_id: 'usr-fr-ural',
                item_id: 'item-ural-201',
                operation: 'SALES_PAYOUT',
                amount: 126000,
                timestamp: daysAgo(12, 17),
            },
            {
                id: 'ledger-ural-002',
                user_id: 'usr-fr-ural',
                operation: 'WITHDRAWAL',
                amount: -12000,
                timestamp: daysAgo(5, 15),
            },
            {
                id: 'ledger-ural-003',
                user_id: 'usr-fr-ural',
                operation: 'MANUAL_ADJ',
                amount: 4000,
                timestamp: daysAgo(2, 10),
            },
            {
                id: 'ledger-baltic-001',
                user_id: 'usr-fr-baltic',
                item_id: 'item-baltic-301',
                operation: 'SALES_PAYOUT',
                amount: 76000,
                timestamp: daysAgo(10, 12),
            },
            {
                id: 'ledger-baltic-002',
                user_id: 'usr-fr-baltic',
                item_id: 'item-baltic-302',
                operation: 'ROYALTY_CHARGE',
                amount: -8000,
                timestamp: daysAgo(9, 19),
            },
            {
                id: 'ledger-baltic-003',
                user_id: 'usr-fr-baltic',
                operation: 'MANUAL_ADJ',
                amount: 2500,
                timestamp: daysAgo(3, 12),
            },
        ],
    });

    // 9) Audit logs
    await db.auditLog.createMany({
        data: [
            {
                id: 'audit-001',
                user_id: 'usr-manager',
                action: 'ITEM_REJECTED',
                details: {
                    itemId: 'item-yak-005',
                    batchId: 'batch-yak-2026-01',
                    reason: 'Несоответствие фракции и маркировки',
                },
                timestamp: daysAgo(44, 16),
            },
            {
                id: 'audit-002',
                user_id: 'usr-manager',
                action: 'ITEM_REJECTED',
                details: {
                    itemId: 'item-ural-204',
                    batchId: 'batch-ural-2026-01',
                    reason: 'Сколы после транспортировки',
                },
                timestamp: daysAgo(31, 15),
            },
            {
                id: 'audit-003',
                user_id: 'usr-admin',
                action: 'BATCH_FLAGGED_ERROR',
                details: {
                    batchId: 'batch-baltic-2026-02',
                    reason: 'Ошибка в сопроводительных документах',
                },
                timestamp: daysAgo(10, 18),
            },
        ],
    });

    // 10) Orders
    await db.order.create({
        data: {
            id: 'order-anna-001',
            user_id: 'usr-cust-anna',
            total: 34400,
            assigned_sales_manager_id: 'usr-sales-manager',
            status: 'RECEIVED',
            delivery_address: 'Казань, ул. Баумана, 14',
            contact_phone: '+7 900 111-22-33',
            contact_email: 'anna.smirnova@example.ru',
            comment: 'Позвонить за час до доставки.',
            created_at: daysAgo(18, 12),
            shipment: {
                create: {
                    id: 'shipment-anna-001',
                    carrier: 'CDEK',
                    tracking_number: 'CDEK-DEMO-ANNA-001',
                    tracking_status_code: 'DELIVERED',
                    tracking_status_label: 'Заказ вручен получателю',
                    last_event_at: daysAgo(14, 15),
                    last_synced_at: daysAgo(14, 16),
                    meta: { source: 'seed' },
                },
            },
            items: {
                create: [
                    { id: 'order-item-anna-001', product_id: 'prod-altai-001', quantity: 1, price: 22600 },
                    { id: 'order-item-anna-002', product_id: 'prod-altai-002', quantity: 1, price: 11800 },
                ],
            },
            status_events: {
                create: [
                    { id: 'order-event-anna-001', to_status: 'NEW', created_at: daysAgo(18, 12), meta: { source: 'seed' } },
                    { id: 'order-event-anna-002', actor_user_id: 'usr-sales-manager', from_status: 'NEW', to_status: 'IN_PROGRESS', created_at: daysAgo(18, 14), meta: { source: 'seed' } },
                    { id: 'order-event-anna-003', actor_user_id: 'usr-sales-manager', from_status: 'IN_PROGRESS', to_status: 'PACKED', created_at: daysAgo(17, 11), meta: { source: 'seed' } },
                    { id: 'order-event-anna-004', actor_user_id: 'usr-sales-manager', from_status: 'PACKED', to_status: 'SHIPPED', created_at: daysAgo(17, 15), meta: { source: 'seed' } },
                    { id: 'order-event-anna-005', actor_user_id: 'usr-sales-manager', from_status: 'SHIPPED', to_status: 'RECEIVED', created_at: daysAgo(14, 16), meta: { source: 'seed' } },
                ],
            },
        },
    });

    await db.order.create({
        data: {
            id: 'order-maxim-001',
            user_id: 'usr-cust-maxim',
            total: 41200,
            assigned_sales_manager_id: 'usr-sales-manager',
            status: 'SHIPPED',
            delivery_address: 'Новосибирск, Красный проспект, 9',
            contact_phone: '+7 901 222-33-44',
            contact_email: 'maxim.lebedev@example.ru',
            comment: 'Доставка в будни после 18:00.',
            created_at: daysAgo(11, 16),
            shipment: {
                create: {
                    id: 'shipment-maxim-001',
                    carrier: 'CDEK',
                    tracking_number: 'CDEK-DEMO-MAXIM-001',
                    tracking_status_code: 'IN_TRANSIT',
                    tracking_status_label: 'Посылка в пути',
                    last_event_at: daysAgo(8, 11),
                    last_synced_at: daysAgo(8, 12),
                    meta: { source: 'seed' },
                },
            },
            items: {
                create: [
                    { id: 'order-item-maxim-001', product_id: 'prod-baltic-001', quantity: 1, price: 41200 },
                ],
            },
            status_events: {
                create: [
                    { id: 'order-event-maxim-001', to_status: 'NEW', created_at: daysAgo(11, 16), meta: { source: 'seed' } },
                    { id: 'order-event-maxim-002', actor_user_id: 'usr-sales-manager', from_status: 'NEW', to_status: 'IN_PROGRESS', created_at: daysAgo(11, 17), meta: { source: 'seed' } },
                    { id: 'order-event-maxim-003', actor_user_id: 'usr-sales-manager', from_status: 'IN_PROGRESS', to_status: 'PACKED', created_at: daysAgo(10, 11), meta: { source: 'seed' } },
                    { id: 'order-event-maxim-004', actor_user_id: 'usr-sales-manager', from_status: 'PACKED', to_status: 'SHIPPED', created_at: daysAgo(8, 12), meta: { source: 'seed' } },
                ],
            },
        },
    });

    await db.order.create({
        data: {
            id: 'order-olga-001',
            user_id: 'usr-cust-olga',
            total: 185000,
            status: 'NEW',
            delivery_address: 'Санкт-Петербург, Невский проспект, 41',
            contact_phone: '+7 902 333-44-55',
            contact_email: 'olga.kuznetsova@example.ru',
            comment: 'Оставить у консьержа, если не отвечаю.',
            created_at: daysAgo(4, 14),
            items: {
                create: [
                    { id: 'order-item-olga-001', product_id: 'prod-yak-001', quantity: 1, price: 185000 },
                ],
            },
            status_events: {
                create: [
                    { id: 'order-event-olga-001', to_status: 'NEW', created_at: daysAgo(4, 14), meta: { source: 'seed' } },
                ],
            },
        },
    });

    await db.order.create({
        data: {
            id: 'order-kirill-001',
            user_id: 'usr-cust-kirill',
            total: 17900,
            assigned_sales_manager_id: 'usr-sales-manager',
            status: 'RETURNED',
            return_reason: 'NOT_PICKED_UP',
            delivery_address: 'Краснодар, ул. Северная, 99',
            contact_phone: '+7 903 444-55-66',
            contact_email: 'kirill.volkov@example.ru',
            comment: 'Отменен клиентом после звонка менеджера.',
            created_at: daysAgo(6, 11),
            shipment: {
                create: {
                    id: 'shipment-kirill-001',
                    carrier: 'CDEK',
                    tracking_number: 'CDEK-DEMO-KIRILL-001',
                    tracking_status_code: 'RETURNED',
                    tracking_status_label: 'Не забран, отправление возвращено',
                    last_event_at: daysAgo(1, 10),
                    last_synced_at: daysAgo(1, 11),
                    meta: { source: 'seed' },
                },
            },
            items: {
                create: [
                    { id: 'order-item-kirill-001', product_id: 'prod-baltic-002', quantity: 1, price: 17900 },
                ],
            },
            status_events: {
                create: [
                    { id: 'order-event-kirill-001', to_status: 'NEW', created_at: daysAgo(6, 11), meta: { source: 'seed' } },
                    { id: 'order-event-kirill-002', actor_user_id: 'usr-sales-manager', from_status: 'NEW', to_status: 'IN_PROGRESS', created_at: daysAgo(6, 12), meta: { source: 'seed' } },
                    { id: 'order-event-kirill-003', actor_user_id: 'usr-sales-manager', from_status: 'IN_PROGRESS', to_status: 'PACKED', created_at: daysAgo(5, 13), meta: { source: 'seed' } },
                    { id: 'order-event-kirill-004', actor_user_id: 'usr-sales-manager', from_status: 'PACKED', to_status: 'SHIPPED', created_at: daysAgo(5, 17), meta: { source: 'seed' } },
                    { id: 'order-event-kirill-005', actor_user_id: 'usr-sales-manager', from_status: 'SHIPPED', to_status: 'RETURN_REQUESTED', created_at: daysAgo(2, 12), meta: { source: 'seed', reason: 'NOT_PICKED_UP' } },
                    { id: 'order-event-kirill-006', actor_user_id: 'usr-sales-manager', from_status: 'RETURN_REQUESTED', to_status: 'RETURN_IN_TRANSIT', created_at: daysAgo(2, 16), meta: { source: 'seed' } },
                    { id: 'order-event-kirill-007', actor_user_id: 'usr-sales-manager', from_status: 'RETURN_IN_TRANSIT', to_status: 'RETURNED', created_at: daysAgo(1, 11), meta: { source: 'seed' } },
                ],
            },
        },
    });

    // 11) Public clone page content
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

    const [locationsCount, productsCount, usersCount, batchesCount, itemsCount, ledgerCount, ordersCount] = await Promise.all([
        db.location.count(),
        db.product.count(),
        db.user.count(),
        db.batch.count(),
        db.item.count(),
        db.ledger.count(),
        db.order.count(),
    ]);

    console.log('Seed completed.');
    console.log(
        `Locations: ${locationsCount}, Products: ${productsCount}, Users: ${usersCount}, ` +
        `Batches: ${batchesCount}, Items: ${itemsCount}, Ledger: ${ledgerCount}, Orders: ${ordersCount}`
    );
}

main()
    .then(async () => {
        await db.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await db.$disconnect();
        process.exit(1);
    });
