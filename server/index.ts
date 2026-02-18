import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateToken } from './middleware/auth.ts';
import type { AuthRequest } from './middleware/auth.ts';
import authRoutes from './routes/auth.ts';
import batchRoutes from './routes/batches.ts';
import itemRoutes from './routes/items.ts';
import hqRoutes from './routes/hq.ts';
import financialRoutes from './routes/financials.ts';
import publicRoutes from './routes/public.ts';
import uploadRoutes from './routes/upload.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3001;
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../public/uploads');
const locationsDir = path.join(__dirname, '../public/locations');

[uploadDir, locationsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow serving images
}));
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

app.use('/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/hq', hqRoutes);
app.use('/api/financials', financialRoutes);
app.use('/api/public', publicRoutes);

app.use('/api/upload', uploadRoutes);

// Get all locations with products and translations
app.get('/api/locations', async (req, res) => {
    try {
        const locations = await prisma.location.findMany({
            include: {
                products: {
                    include: {
                        translations: true,
                        category: {
                            include: { translations: true }
                        }
                    }
                },
                translations: true
            }
        });
        res.json(locations);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});

// Get user (mock/first user for now)
app.get('/api/user', async (req, res) => {
    try {
        const user = await prisma.user.findFirst();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user' });
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

// Cart
app.get('/api/cart', async (req, res) => {
    res.json([]);
});

// Categories
app.get('/api/categories', async (req, res) => {
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
app.post('/api/locations', async (req, res) => {
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
app.put('/api/locations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            lat, lng, image, translations
        } = req.body;

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
app.delete('/api/locations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.location.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete location' });
    }
});

// Get products
app.get('/api/products', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            include: {
                location: { include: { translations: true } },
                category: { include: { translations: true } },
                translations: true
            }
        });
        res.json(products);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// Create product
app.post('/api/products', async (req, res) => {
    try {
        const {
            price, image, location_id, category_id, translations
        } = req.body;
        const product = await prisma.product.create({
            data: {
                price: parseFloat(price),
                image,
                location_id,
                category_id,
                translations: {
                    create: translations
                }
            },
            include: { translations: true }
        });
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const {
            price, image, location_id, category_id, translations
        } = req.body;
        const product = await prisma.product.update({
            where: { id },
            data: {
                price: parseFloat(price),
                image,
                location_id,
                category_id,
                translations: {
                    deleteMany: {},
                    create: translations
                }
            },
            include: { translations: true }
        });
        res.json(product);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.product.delete({ where: { id } });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// ===== LANGUAGE API =====

// Get all languages
app.get('/api/languages', async (req, res) => {
    try {
        const languages = await prisma.language.findMany();
        res.json(languages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch languages' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
