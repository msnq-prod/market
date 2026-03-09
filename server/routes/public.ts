import express from 'express';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { buildCloneUrl } from '../utils/cloneUrls.ts';

const router = express.Router();
const prisma = new PrismaClient();

// Get QR code image for public clone page
router.get('/items/:publicToken/qr', async (req, res) => {
    const { publicToken } = req.params;
    try {
        const item = await prisma.item.findUnique({
            where: { public_token: publicToken },
            select: { id: true }
        });

        if (!item) return res.status(404).json({ error: 'Item not found' });

        const qrPayload = buildCloneUrl(req, publicToken);
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
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// Get Item Info by Public Token
router.get('/items/:publicToken', async (req, res) => {
    const { publicToken } = req.params;
    try {
        const item = await prisma.item.findUnique({
            where: { public_token: publicToken },
            include: {
                batch: {
                    include: {
                        owner: { select: { name: true } }
                    }
                }
            }
        });

        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Filter sensitive data?
        res.json({
            ...item,
            clone_url: buildCloneUrl(req, publicToken)
        });
    } catch (_error) {
        res.status(500).json({ error: 'Failed to fetch item' });
    }
});

// Activate Item (Scan Inner QR)
// In real world, this endpoint might need protection or strict logical checks.
// Here we assume scanning inner QR acts as proof of purchase/opening.
router.post('/items/:publicToken/activate', async (req, res) => {
    const { publicToken } = req.params;

    try {
        const item = await prisma.item.findUnique({
            where: { public_token: publicToken },
            include: { batch: true }
        });

        if (!item) return res.status(404).json({ error: 'Item not found' });

        if (item.status === 'ACTIVATED') {
            return res.json({
                message: 'Item already activated',
                activation_date: item.activation_date
            });
        }

        const now = new Date();
        const franchiseeId = item.batch.owner_id;

        // Financial Logic
        if (item.status === 'ON_CONSIGNMENT') {
            // Offline Sale -> Charge Royalty from Franchisee
            // Amount = Fixed Royalty (Use commission_rate from User or fixed value?)
            // Spec says: "Sписать с баланса Франчайзи комиссию (Роялти)."
            // Let's use `user.commission_rate` as a placeholder for royalty amount or percentage?
            // "Commission Rate" usually % of sale. But we don't know sale price here.
            // Or maybe default royalty is fixed. Let's assume 100 for now or fetch from User config.

            const franchisee = await prisma.user.findUnique({ where: { id: franchiseeId } });
            const royaltyAmount = Number(franchisee?.commission_rate) || 50; // Default 50 if 0/null

            await prisma.$transaction([
                // Update Item
                prisma.item.update({
                    where: { id: item.id },
                    data: {
                        status: 'ACTIVATED',
                        activation_date: now
                    }
                }),
                // Charge Ledger
                prisma.ledger.create({
                    data: {
                        user_id: franchiseeId,
                        item_id: item.id,
                        operation: 'ROYALTY_CHARGE', // Debit
                        amount: -royaltyAmount
                    }
                }),
                // Update User Balance
                prisma.user.update({
                    where: { id: franchiseeId },
                    data: {
                        balance: { decrement: royaltyAmount }
                    }
                })
            ]);

        } else if (item.status === 'STOCK_ONLINE' || item.status === 'SOLD_ONLINE') {
            // Online Sale -> Credit Supplier (Franchisee)
            // "Начислить на баланс Поставщика камня (Сумма продажи - Комиссия HQ)"
            // Sales price? Validating purchase?
            // We assume price_sold is set or we use a fixed price for now. 
            // Let's assume net payout 500 for demo. Or 0 if price not set.
            const payoutAmount = Number(item.price_sold || 500); // Placeholder

            await prisma.$transaction([
                prisma.item.update({
                    where: { id: item.id },
                    data: {
                        status: 'ACTIVATED',
                        activation_date: now
                    }
                }),
                prisma.ledger.create({
                    data: {
                        user_id: franchiseeId,
                        item_id: item.id,
                        operation: 'SALES_PAYOUT', // Credit
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
            // Just activate without finance? Or error?
            // Maybe it was stolen?
            // Allow activation but log warning?
            await prisma.item.update({
                where: { id: item.id },
                data: { status: 'ACTIVATED', activation_date: now }
            });
        }

        res.json({ success: true, message: 'Item Activated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Activation failed' });
    }
});

export default router;
