import express from 'express';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { buildCloneUrl } from '../utils/cloneUrls.ts';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/items/:publicToken/qr', async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { public_token: req.params.publicToken },
            select: { id: true }
        });

        if (!item) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const qrPayload = buildCloneUrl(req, req.params.publicToken);
        const pngBuffer = await QRCode.toBuffer(qrPayload, {
            type: 'png',
            width: 512,
            errorCorrectionLevel: 'M',
            margin: 1
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(pngBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось сгенерировать QR-код.' });
    }
});

router.get('/items/:publicToken', async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { public_token: req.params.publicToken },
            include: {
                batch: {
                    include: {
                        owner: {
                            select: { id: true, name: true }
                        }
                    }
                },
                product: {
                    include: {
                        translations: true,
                        location: {
                            include: {
                                translations: true
                            }
                        }
                    }
                }
            }
        });

        if (!item) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        res.json({
            id: item.id,
            temp_id: item.temp_id,
            serial_number: item.serial_number,
            public_token: item.public_token,
            status: item.status,
            is_sold: item.is_sold,
            activation_date: item.activation_date,
            photo_url: item.item_photo_url || item.photo_url,
            item_photo_url: item.item_photo_url,
            item_video_url: item.item_video_url,
            collected_date: item.collected_date,
            collected_time: item.collected_time,
            clone_url: buildCloneUrl(req, req.params.publicToken),
            batch: {
                id: item.batch.id,
                gps_lat: item.batch.gps_lat,
                gps_lng: item.batch.gps_lng,
                video_url: item.batch.video_url,
                collected_date: item.batch.collected_date,
                collected_time: item.batch.collected_time,
                created_at: item.batch.created_at,
                owner: item.batch.owner
            },
            product: item.product ? {
                id: item.product.id,
                price: Number(item.product.price),
                image: item.product.image,
                country_code: item.product.country_code,
                location_code: item.product.location_code,
                item_code: item.product.item_code,
                location_description: item.product.location_description,
                is_published: item.product.is_published,
                translations: item.product.translations,
                location: item.product.location
            } : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить паспорт камня.' });
    }
});

router.post('/items/:publicToken/activate', async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { public_token: req.params.publicToken },
            include: {
                batch: true
            }
        });

        if (!item) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        if (item.status === 'ACTIVATED') {
            return res.json({
                message: 'Камень уже активирован.',
                activation_date: item.activation_date
            });
        }

        const now = new Date();
        const franchiseeId = item.batch.owner_id;

        if (item.status === 'ON_CONSIGNMENT') {
            const franchisee = await prisma.user.findUnique({ where: { id: franchiseeId } });
            const royaltyAmount = Number(franchisee?.commission_rate) || 50;

            await prisma.$transaction([
                prisma.item.update({
                    where: { id: item.id },
                    data: {
                        status: 'ACTIVATED',
                        activation_date: now,
                        is_sold: true
                    }
                }),
                prisma.ledger.create({
                    data: {
                        user_id: franchiseeId,
                        item_id: item.id,
                        operation: 'ROYALTY_CHARGE',
                        amount: -royaltyAmount
                    }
                }),
                prisma.user.update({
                    where: { id: franchiseeId },
                    data: {
                        balance: { decrement: royaltyAmount }
                    }
                })
            ]);
        } else if (item.status === 'STOCK_ONLINE' || item.status === 'SOLD_ONLINE') {
            const payoutAmount = Number(item.price_sold || 500);

            await prisma.$transaction([
                prisma.item.update({
                    where: { id: item.id },
                    data: {
                        status: 'ACTIVATED',
                        activation_date: now,
                        is_sold: true
                    }
                }),
                prisma.ledger.create({
                    data: {
                        user_id: franchiseeId,
                        item_id: item.id,
                        operation: 'SALES_PAYOUT',
                        amount: payoutAmount
                    }
                }),
                prisma.user.update({
                    where: { id: franchiseeId },
                    data: {
                        balance: { increment: payoutAmount }
                    }
                })
            ]);
        } else {
            await prisma.item.update({
                where: { id: item.id },
                data: {
                    status: 'ACTIVATED',
                    activation_date: now,
                    is_sold: true
                }
            });
        }

        res.json({ success: true, message: 'Камень активирован.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось активировать камень.' });
    }
});

export default router;
