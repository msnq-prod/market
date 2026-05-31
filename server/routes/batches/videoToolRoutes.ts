import express from 'express';
import { authenticateToken } from '../../middleware/auth.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { isStaffRole } from '../../utils/collectionWorkflow.ts';
import { BATCH_INCLUDE, createHttpError, getErrorMessage, getErrorStatusCode, prisma, serializeBatch } from './shared.ts';

const router = express.Router();

router.get('/:id/video-tool', authenticateToken, async (req: AuthRequest, res) => {
    try {
        if (!req.user) return res.sendStatus(401);
        if (!isStaffRole(req.user.role)) return res.sendStatus(403);

        const batch = await prisma.batch.findFirst({
            where: {
                id: req.params.id,
                deleted_at: null
            },
            include: BATCH_INCLUDE
        });

        if (!batch) {
            throw createHttpError('Партия не найдена.', 404);
        }

        const serialized = serializeBatch(req, batch);
        res.json({
            batch: {
                id: serialized.id,
                status: serialized.status,
                created_at: serialized.created_at,
                updated_at: serialized.updated_at,
                collected_date: serialized.collected_date,
                collected_time: serialized.collected_time,
                daily_batch_seq: serialized.daily_batch_seq,
                expected_output_count: serialized.items.length,
                video_processing: serialized.video_processing
            },
            product: serialized.product
                ? {
                    id: serialized.product.id,
                    country_code: serialized.product.country_code,
                    location_code: serialized.product.location_code,
                    item_code: serialized.product.item_code,
                    translations: serialized.product.translations
                }
                : null,
            items: serialized.items.map((item) => ({
                id: item.id,
                temp_id: item.temp_id,
                item_seq: item.item_seq,
                serial_number: item.serial_number,
                item_video_url: item.item_video_url
            }))
        });
    } catch (error) {
        console.error(error);
        const statusCode = getErrorStatusCode(error);
        const message = getErrorMessage(error, 'Не удалось загрузить данные для монтажного инструмента.');
        res.status(statusCode).json({ error: message });
    }
});

export default router;
