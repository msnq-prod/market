import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { authenticateToken, requireRole } from './middleware/auth.ts';
import type { AuthRequest } from './middleware/auth.ts';
import authRoutes from './routes/auth.ts';
import batchRoutes from './routes/batches.ts';
import itemRoutes from './routes/items.ts';
import hqRoutes from './routes/hq.ts';
import financialRoutes from './routes/financials.ts';
import publicRoutes from './routes/public.ts';
import uploadRoutes from './routes/upload.ts';
import contentRoutes from './routes/content.ts';
import collectionRequestsRoutes from './routes/collectionRequests.ts';
import ordersRoutes from './routes/orders.ts';
import { isStaffRole, normalizeCode } from './utils/collectionWorkflow.ts';
import { resolveProjectPath } from './utils/projectPaths.ts';
import { softDeleteLocation, softDeleteProduct } from './utils/softDelete.ts';

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
const helperConnectOrigins = [
    'http://127.0.0.1:3012',
    'http://localhost:3012'
];

const getPrismaErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
            return 'Связанная категория или локация не найдена.';
        }
        if (error.code === 'P2025') {
            return 'Запись не найдена.';
        }
    }

    return fallback;
};

const normalizeOptionalUrl = (value: unknown) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const getDeleteErrorResponse = (error: unknown, fallback: string) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
            return { status: 404, error: 'Запись не найдена.' };
        }
    }

    return { status: 500, error: fallback };
};

const parseTemplateCode = (value: unknown, fallback: string, maxLength: number) => {
    if (typeof value !== 'string') {
        return fallback;
    }

    return normalizeCode(value, fallback, maxLength);
};

const serializeProduct = <T extends {
    id: string;
    price: Prisma.Decimal;
    image: string;
    wildberries_url: string | null;
    ozon_url: string | null;
    location_id: string;
    category_id: string;
    country_code: string;
    location_code: string;
    item_code: string;
    location_description: string | null;
    is_published: boolean;
    created_at: Date;
    updated_at: Date;
    translations: unknown[];
    category?: unknown;
    location?: unknown;
    items?: Array<{ id: string }>;
    batches?: Array<{ id: string; status: string; created_at: Date; items?: Array<{ id: string }> }>;
}>(product: T) => {
    const availableStock = product.items?.length || 0;

    return {
        id: product.id,
        price: Number(product.price),
        image: product.image,
        wildberries_url: product.wildberries_url,
        ozon_url: product.ozon_url,
        location_id: product.location_id,
        category_id: product.category_id,
        country_code: product.country_code,
        location_code: product.location_code,
        item_code: product.item_code,
        location_description: product.location_description,
        is_published: product.is_published,
        created_at: product.created_at,
        updated_at: product.updated_at,
        available_stock: availableStock,
        available: availableStock > 0,
        translations: product.translations,
        category: product.category,
        location: product.location,
        batches: product.batches?.map((batch) => ({
            id: batch.id,
            status: batch.status,
            created_at: batch.created_at,
            items_count: batch.items?.length || 0
        })) || []
    };
};

// Ensure uploads directory exists
const uploadDir = resolveProjectPath('public', 'uploads');
const locationsDir = resolveProjectPath('public', 'locations');
const distDir = resolveProjectPath('dist');
const distIndexPath = path.join(distDir, 'index.html');

[uploadDir, locationsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow serving images
    contentSecurityPolicy: {
        directives: {
            connectSrc: ["'self'", ...helperConnectOrigins],
            mediaSrc: ["'self'", 'blob:', ...helperConnectOrigins],
            upgradeInsecureRequests: null
        }
    }
}));
app.set('trust proxy', 1);
app.use(cors({
    origin: clientUrl,
    credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// Static media (uploaded files and pre-bundled location images)
app.use('/uploads', express.static(uploadDir));
app.use('/locations', express.static(locationsDir));

app.get('/healthz', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok' });
    } catch (error) {
        console.error(error);
        res.status(503).json({ status: 'error', error: 'Database unavailable' });
    }
});

app.use('/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/hq', hqRoutes);
app.use('/api/financials', financialRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/collection-requests', collectionRequestsRoutes);
app.use('/api/orders', ordersRoutes);

app.use('/api/upload', uploadRoutes);

// Get all locations with products and translations
app.get('/api/locations', async (_req, res) => {
    try {
        const locations = await prisma.location.findMany({
            where: {
                deleted_at: null
            },
            include: {
                products: {
                    where: {
                        is_published: true,
                        deleted_at: null
                    },
                    include: {
                        translations: true,
                        category: {
                            include: { translations: true }
                        },
                        items: {
                            where: {
                                deleted_at: null,
                                status: 'STOCK_ONLINE',
                                is_sold: false
                            },
                            select: { id: true }
                        }
                    }
                },
                translations: true
            }
        });

        res.json(locations.map((location) => ({
            ...location,
            products: location.products.map((product) => serializeProduct(product))
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

app.get('/api/user', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) {
            return res.sendStatus(401);
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                role: true
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить текущего пользователя.' });
    }
});

app.get('/api/admin/dashboard-summary', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !isStaffRole(req.user.role)) {
        return res.sendStatus(403);
    }

    try {
        const [
            totalLocations,
            totalProducts,
            publishedProducts,
            totalUsers,
            franchisees,
            inTransitBatches,
            receivedBatches,
            stockHqItems,
            stockOnlineItems,
            publishedLocationRows
        ] = await prisma.$transaction([
            prisma.location.count({ where: { deleted_at: null } }),
            prisma.product.count({ where: { deleted_at: null } }),
            prisma.product.count({ where: { is_published: true, deleted_at: null } }),
            prisma.user.count(),
            prisma.user.count({ where: { role: 'FRANCHISEE' } }),
            prisma.batch.count({ where: { status: 'TRANSIT', deleted_at: null } }),
            prisma.batch.count({ where: { status: 'RECEIVED', deleted_at: null } }),
            prisma.item.count({ where: { status: 'STOCK_HQ', is_sold: false, deleted_at: null } }),
            prisma.item.count({ where: { status: 'STOCK_ONLINE', is_sold: false, deleted_at: null } }),
            prisma.product.findMany({
                where: {
                    is_published: true,
                    deleted_at: null
                },
                distinct: ['location_id'],
                select: { location_id: true }
            })
        ]);

        res.json({
            locations_total: totalLocations,
            locations_published: publishedLocationRows.length,
            products_total: totalProducts,
            products_published: publishedProducts,
            users_total: totalUsers,
            franchisees_total: franchisees,
            batches_in_transit: inTransitBatches,
            batches_received: receivedBatches,
            items_stock_hq: stockHqItems,
            items_stock_online: stockOnlineItems
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить сводку дашборда.' });
    }
});

// Admin user list for HQ screens
app.get('/api/users', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !['ADMIN', 'MANAGER'].includes(req.user.role)) {
        return res.sendStatus(403);
    }

    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                balance: true,
                commission_rate: true,
                created_at: true
            },
            orderBy: { created_at: 'desc' }
        });
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !['ADMIN', 'MANAGER'].includes(req.user.role)) {
        return res.sendStatus(403);
    }

    const { name, email, password, role } = req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
    };

    const safeName = typeof name === 'string' ? name.trim() : '';
    const safeEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const safePassword = typeof password === 'string' ? password : '';
    const safeRole = typeof role === 'string' ? role.trim() : '';
    const allowedRoles = req.user.role === 'ADMIN'
        ? new Set(['ADMIN', 'MANAGER', 'SALES_MANAGER', 'FRANCHISEE'])
        : new Set(['SALES_MANAGER', 'FRANCHISEE']);

    if (!safeName) {
        return res.status(400).json({ error: 'Укажите имя пользователя.' });
    }

    if (!safeEmail) {
        return res.status(400).json({ error: 'Укажите email пользователя.' });
    }

    if (!safePassword || safePassword.length < 6) {
        return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов.' });
    }

    if (!allowedRoles.has(safeRole)) {
        return res.status(403).json({ error: 'Недостаточно прав для создания пользователя с этой ролью.' });
    }

    try {
        const passwordHash = await bcrypt.hash(safePassword, 10);
        const user = await prisma.user.create({
            data: {
                name: safeName,
                email: safeEmail,
                password_hash: passwordHash,
                role: safeRole as 'ADMIN' | 'MANAGER' | 'SALES_MANAGER' | 'FRANCHISEE'
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                balance: true,
                commission_rate: true,
                created_at: true
            }
        });

        res.status(201).json(user);
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Не удалось создать пользователя. Возможно, email уже используется.' });
    }
});

// Cart
app.get('/api/cart', async (_req, res) => {
    res.json([]);
});

// Categories
app.get('/api/categories', async (_req, res) => {
    try {
        const categories = await prisma.category.findMany({
            include: { translations: true }
        });
        res.json(categories);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// ===== ADMIN API =====

// Create location
app.post('/api/locations', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const {
            lat, lng, image, translations
        } = req.body;
        // translations should be an array of { language_id, name, country, description }
        const location = await prisma.location.create({
            data: {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                image,
                translations: {
                    create: translations
                }
            },
            include: { translations: true }
        });
        res.json(location);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create location' });
    }
});

// Update location
app.put('/api/locations/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            lat, lng, image, translations
        } = req.body;

        const existingLocation = await prisma.location.findFirst({
            where: {
                id,
                deleted_at: null
            },
            select: { id: true }
        });

        if (!existingLocation) {
            return res.status(404).json({ error: 'Локация не найдена.' });
        }

        // Update basic info and translations
        // Simplest way for translations: delete all and re-create, or update individually
        const location = await prisma.location.update({
            where: { id },
            data: {
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                image,
                translations: {
                    deleteMany: {},
                    create: translations
                }
            },
            include: { translations: true }
        });
        res.json(location);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

// Delete location
app.delete('/api/locations/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await prisma.$transaction((tx) => softDeleteLocation(tx, id));
        if (!deleted) {
            res.status(404).json({ error: 'Локация не найдена.' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        const errorResponse = getDeleteErrorResponse(error, 'Не удалось удалить локацию.');
        res.status(errorResponse.status).json({ error: errorResponse.error });
    }
});

// Get products
app.get('/api/products', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !isStaffRole(req.user.role)) {
        return res.sendStatus(403);
    }

    try {
        const products = await prisma.product.findMany({
            where: {
                deleted_at: null
            },
            include: {
                location: { include: { translations: true } },
                category: { include: { translations: true } },
                translations: true,
                items: {
                    where: {
                        deleted_at: null,
                        status: 'STOCK_ONLINE',
                        is_sold: false
                    },
                    select: { id: true }
                },
                batches: {
                    orderBy: { created_at: 'desc' },
                    include: {
                        items: { select: { id: true } }
                    }
                }
            }
        });
        res.json(products.map((product) => serializeProduct(product)));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Create product
app.post('/api/products', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const {
            price,
            image,
            wildberries_url,
            ozon_url,
            location_id,
            category_id,
            translations,
            country_code,
            location_code,
            item_code,
            location_description,
            is_published
        } = req.body;

        const location = await prisma.location.findFirst({
            where: {
                id: location_id,
                deleted_at: null
            },
            select: { id: true }
        });

        if (!location) {
            return res.status(400).json({ error: 'Связанная категория или локация не найдена.' });
        }

        const product = await prisma.product.create({
            data: {
                price: parseFloat(price),
                image,
                wildberries_url: normalizeOptionalUrl(wildberries_url),
                ozon_url: normalizeOptionalUrl(ozon_url),
                location_id,
                category_id,
                country_code: parseTemplateCode(country_code, 'RUS', 3),
                location_code: parseTemplateCode(location_code, 'LOC', 3),
                item_code: parseTemplateCode(item_code, '00', 8),
                location_description: typeof location_description === 'string' && location_description.trim()
                    ? location_description.trim()
                    : null,
                is_published: Boolean(is_published),
                translations: {
                    create: translations
                }
            },
            include: {
                location: { include: { translations: true } },
                category: { include: { translations: true } },
                translations: true,
                items: {
                    where: {
                        status: 'STOCK_ONLINE',
                        deleted_at: null,
                        is_sold: false
                    },
                    select: { id: true }
                },
                batches: {
                    orderBy: { created_at: 'desc' },
                    include: {
                        items: { select: { id: true } }
                    }
                }
            }
        });
        res.json(serializeProduct(product));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: getPrismaErrorMessage(error, 'Failed to create product') });
    }
});

// Update product
app.put('/api/products/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            price,
            image,
            wildberries_url,
            ozon_url,
            location_id,
            category_id,
            translations,
            country_code,
            location_code,
            item_code,
            location_description,
            is_published
        } = req.body;

        const existingProduct = await prisma.product.findFirst({
            where: {
                id,
                deleted_at: null
            },
            select: { id: true }
        });

        if (!existingProduct) {
            return res.status(404).json({ error: 'Товар-шаблон не найден.' });
        }

        const location = await prisma.location.findFirst({
            where: {
                id: location_id,
                deleted_at: null
            },
            select: { id: true }
        });

        if (!location) {
            return res.status(400).json({ error: 'Связанная категория или локация не найдена.' });
        }

        const product = await prisma.product.update({
            where: { id },
            data: {
                price: parseFloat(price),
                image,
                wildberries_url: normalizeOptionalUrl(wildberries_url),
                ozon_url: normalizeOptionalUrl(ozon_url),
                location_id,
                category_id,
                country_code: parseTemplateCode(country_code, 'RUS', 3),
                location_code: parseTemplateCode(location_code, 'LOC', 3),
                item_code: parseTemplateCode(item_code, '00', 8),
                location_description: typeof location_description === 'string' && location_description.trim()
                    ? location_description.trim()
                    : null,
                is_published: Boolean(is_published),
                translations: {
                    deleteMany: {},
                    create: translations
                }
            },
            include: {
                location: { include: { translations: true } },
                category: { include: { translations: true } },
                translations: true,
                items: {
                    where: {
                        status: 'STOCK_ONLINE',
                        deleted_at: null,
                        is_sold: false
                    },
                    select: { id: true }
                },
                batches: {
                    orderBy: { created_at: 'desc' },
                    include: {
                        items: { select: { id: true } }
                    }
                }
            }
        });
        res.json(serializeProduct(product));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: getPrismaErrorMessage(error, 'Failed to update product') });
    }
});

app.patch('/api/products/:id/publish', authenticateToken, async (req: AuthRequest, res) => {
    if (!req.user || !isStaffRole(req.user.role)) {
        return res.sendStatus(403);
    }

    try {
        const existingProduct = await prisma.product.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            select: { id: true }
        });

        if (!existingProduct) {
            return res.status(404).json({ error: 'Товар-шаблон не найден.' });
        }

        const product = await prisma.product.update({
            where: { id: existingProduct.id },
            data: {
                is_published: Boolean(req.body?.is_published)
            },
            include: {
                location: { include: { translations: true } },
                category: { include: { translations: true } },
                translations: true,
                items: {
                    where: {
                        deleted_at: null,
                        status: 'STOCK_ONLINE',
                        is_sold: false
                    },
                    select: { id: true }
                },
                batches: {
                    orderBy: { created_at: 'desc' },
                    include: {
                        items: { select: { id: true } }
                    }
                }
            }
        });

        res.json(serializeProduct(product));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: getPrismaErrorMessage(error, 'Failed to update publish state') });
    }
});

// Delete product
app.delete('/api/products/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await prisma.$transaction((tx) => softDeleteProduct(tx, id));
        if (!deleted) {
            res.status(404).json({ error: 'Товар-шаблон не найден.' });
            return;
        }

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        const errorResponse = getDeleteErrorResponse(error, 'Не удалось удалить товар-шаблон.');
        res.status(errorResponse.status).json({ error: errorResponse.error });
    }
});

// ===== LANGUAGE API =====

// Get all languages
app.get('/api/languages', async (_req, res) => {
    try {
        const languages = await prisma.language.findMany();
        res.json(languages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
});

if (fs.existsSync(distIndexPath)) {
    app.use(express.static(distDir));

    app.use((req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method)) {
            next();
            return;
        }

        if (
            req.path.startsWith('/api') ||
            req.path.startsWith('/auth') ||
            req.path.startsWith('/uploads') ||
            req.path.startsWith('/locations')
        ) {
            next();
            return;
        }

        res.sendFile(distIndexPath);
    });
}

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
