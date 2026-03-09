import type express from 'express';

export const buildCloneUrl = (req: express.Request, publicToken: string): string => {
    const clientUrl = (process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return `${clientUrl}/clone/${encodeURIComponent(publicToken)}`;
};

export const buildQrUrl = (publicToken: string): string => {
    return `/api/public/items/${encodeURIComponent(publicToken)}/qr`;
};

