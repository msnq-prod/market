import express from 'express';
import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import { buildCloneUrl } from '../utils/cloneUrls.ts';
import { getDefaultProductTranslation, isPublicPassportAvailable, looksLikeLegacyItemSerial } from '../utils/collectionWorkflow.ts';

const router = express.Router();
const prisma = new PrismaClient();
const PUBLIC_ACTIVATION_ALLOWED_STATUSES = new Set(['ON_CONSIGNMENT', 'STOCK_ONLINE', 'SOLD_ONLINE']);

const pickCollectionDate = (batchDate: Date | null, itemDate: Date | null): Date | null => batchDate || itemDate || null;
const pickCollectionTime = (batchTime: string | null, itemTime: string | null): string | null => batchTime || itemTime || null;
const normalizeSerialNumber = (value: string): string => value.trim().toUpperCase();
const isResolvableCurrentSerial = (value: string): boolean => !looksLikeLegacyItemSerial(value);
const getPreferredLocationName = (
    translations: Array<{ language_id: number; name: string }>
): string | null => (
    translations.find((translation) => translation.language_id === 2)?.name
    || translations.find((translation) => translation.language_id === 1)?.name
    || translations[0]?.name
    || null
);

router.get('/items/:serialNumber/qr', async (req, res) => {
    try {
        const serialNumber = normalizeSerialNumber(req.params.serialNumber);
        if (!isResolvableCurrentSerial(serialNumber)) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const item = await prisma.item.findFirst({
            where: {
                serial_number: serialNumber,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                },
                product: {
                    is: {
                        deleted_at: null,
                        location: {
                            is: {
                                deleted_at: null
                            }
                        }
                    }
                }
            },
            select: {
                serial_number: true,
                status: true,
                batch: {
                    select: {
                        status: true
                    }
                }
            }
        });

        if (!item || !isPublicPassportAvailable(item.status, item.batch?.status)) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const qrPayload = buildCloneUrl(req, item.serial_number);
        if (!qrPayload) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }
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

router.get('/items/:serialNumber', async (req, res) => {
    try {
        const serialNumber = normalizeSerialNumber(req.params.serialNumber);
        if (!isResolvableCurrentSerial(serialNumber)) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const item = await prisma.item.findFirst({
            where: {
                serial_number: serialNumber,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                },
                product: {
                    is: {
                        deleted_at: null,
                        location: {
                            is: {
                                deleted_at: null
                            }
                        }
                    }
                }
            },
            include: {
                batch: {
                    select: {
                        status: true,
                        gps_lat: true,
                        gps_lng: true,
                        collected_date: true,
                        collected_time: true
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

        if (!item || !item.product || !isPublicPassportAvailable(item.status, item.batch?.status)) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const preferredTranslation = item.product ? getDefaultProductTranslation(item.product.translations) : null;
        const collectionDate = pickCollectionDate(item.batch.collected_date, item.collected_date);
        const collectionTime = pickCollectionTime(item.batch.collected_time, item.collected_time);
        const photoUrl = item.item_photo_url || item.photo_url || null;
        const videoUrl = item.item_video_url || null;
        const locationName = item.product.location
            ? getPreferredLocationName(item.product.location.translations)
            : null;

        res.json({
            serial_number: item.serial_number,
            clone_url: buildCloneUrl(req, item.serial_number),
            product_name: preferredTranslation?.name || 'Товар',
            product_description: preferredTranslation?.description || '',
            location_name: locationName,
            collection_date: collectionDate?.toISOString() || null,
            collection_time: collectionTime,
            gps_lat: item.batch.gps_lat,
            gps_lng: item.batch.gps_lng,
            photo_url: photoUrl,
            video_url: videoUrl,
            has_photo: Boolean(photoUrl),
            has_video: Boolean(videoUrl)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось загрузить паспорт камня.' });
    }
});

router.post('/items/:serialNumber/activate', async (req, res) => {
    try {
        const serialNumber = normalizeSerialNumber(req.params.serialNumber);
        if (!isResolvableCurrentSerial(serialNumber)) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        const item = await prisma.item.findFirst({
            where: {
                serial_number: serialNumber,
                deleted_at: null,
                batch: {
                    is: {
                        deleted_at: null
                    }
                },
                product: {
                    is: {
                        deleted_at: null,
                        location: {
                            is: {
                                deleted_at: null
                            }
                        }
                    }
                }
            },
            include: {
                batch: true
            }
        });

        if (!item) {
            return res.status(404).json({ error: 'Камень не найден.' });
        }

        if (item.status === 'ACTIVATED') {
            return res.json({
                message: 'Item already activated.',
                activation_date: item.activation_date
            });
        }

        const now = new Date();

        if (!PUBLIC_ACTIVATION_ALLOWED_STATUSES.has(item.status)) {
            return res.status(409).json({
                error: 'Item is not available for public activation.'
            });
        }

        await prisma.item.update({
            where: { id: item.id },
            data: {
                status: 'ACTIVATED',
                activation_date: now,
                is_sold: true
            }
        });

        res.json({
            success: true,
            message: 'Item activated. Financial settlement must be completed in a protected staff workflow.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Не удалось активировать камень.' });
    }
});

export default router;
