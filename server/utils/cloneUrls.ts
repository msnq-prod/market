import type express from 'express';
import { looksLikeLegacyItemSerial } from './collectionWorkflow.ts';

export const buildCloneUrl = (req: express.Request, serialNumber: string | null): string | null => {
    if (!serialNumber || looksLikeLegacyItemSerial(serialNumber)) {
        return null;
    }

    const clientUrl = (process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return `${clientUrl}/clone/${encodeURIComponent(serialNumber)}`;
};

export const buildQrUrl = (serialNumber: string | null): string | null => {
    if (!serialNumber || looksLikeLegacyItemSerial(serialNumber)) {
        return null;
    }

    return `/api/public/items/${encodeURIComponent(serialNumber)}/qr`;
};
