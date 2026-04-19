import { Buffer } from 'node:buffer';
import { expect, test, type APIRequestContext } from '@playwright/test';

type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

const ADMIN_EMAIL = 'admin@stones.com';
const MANAGER_EMAIL = 'manager@stones.com';
const PARTNER_EMAIL = 'yakutia.partner@stones.com';
const DEFAULT_PASSWORD = 'partner123';
const ADMIN_PASSWORD = 'admin123';
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9swrYccAAAAASUVORK5CYII=',
    'base64'
);

const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

async function login(request: APIRequestContext, email: string, password: string): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email, password }
    });

    expect(response.ok()).toBeTruthy();
    return response.json() as Promise<LoginPayload>;
}

test('API guardrails: removed /api/user and uploads require authentication', async ({ request }) => {
    const removedUserEndpoint = await request.get('/api/user');
    expect(removedUserEndpoint.status()).toBe(401);

    const unauthenticatedUpload = await request.post('/api/upload/photo', {
        multipart: {
            file: {
                name: 'guardrail.jpg',
                mimeType: 'image/jpeg',
                buffer: Buffer.from('guardrail')
            }
        }
    });
    expect(unauthenticatedUpload.status()).toBe(401);

    const partner = await login(request, PARTNER_EMAIL, DEFAULT_PASSWORD);
    const currentUserResponse = await request.get('/api/user', {
        headers: {
            Authorization: `Bearer ${partner.accessToken}`
        }
    });
    expect(currentUserResponse.status()).toBe(200);
    const currentUser = await currentUserResponse.json() as Record<string, unknown>;
    expect(currentUser.email).toBe(PARTNER_EMAIL);
    expect(currentUser).not.toHaveProperty('password_hash');
    expect(currentUser).not.toHaveProperty('balance');

    const authenticatedUpload = await request.post('/api/upload/video', {
        headers: {
            Authorization: `Bearer ${partner.accessToken}`
        },
        multipart: {
            file: {
                name: 'guardrail.mp4',
                mimeType: 'video/mp4',
                buffer: Buffer.from('guardrail-video')
            }
        }
    });
    expect(authenticatedUpload.ok()).toBeTruthy();
    const uploadPayload = await authenticatedUpload.json() as { url?: string };
    expect(uploadPayload.url || '').toContain('/uploads/videos/');
});

test('API guardrails: upload strips dangerous extensions, blocks active markup, and serves uploads with nosniff', async ({ request }) => {
    const partner = await login(request, PARTNER_EMAIL, DEFAULT_PASSWORD);

    const disguisedImageUpload = await request.post('/api/upload/photo', {
        headers: {
            Authorization: `Bearer ${partner.accessToken}`
        },
        multipart: {
            file: {
                name: 'payload.svg',
                mimeType: 'image/png',
                buffer: TINY_PNG
            }
        }
    });
    expect(disguisedImageUpload.ok()).toBeTruthy();
    const disguisedPayload = await disguisedImageUpload.json() as { url?: string };
    expect(disguisedPayload.url || '').toMatch(/\/uploads\/photos\/.+\.png$/);
    expect(disguisedPayload.url || '').not.toContain('.svg');

    const uploadedFileResponse = await request.get(disguisedPayload.url || '');
    expect(uploadedFileResponse.status()).toBe(200);
    expect(uploadedFileResponse.headers()['x-content-type-options']).toBe('nosniff');
    expect(uploadedFileResponse.headers()['content-disposition']).toContain('inline');

    const activeMarkupUpload = await request.post('/api/upload/photo', {
        headers: {
            Authorization: `Bearer ${partner.accessToken}`
        },
        multipart: {
            file: {
                name: 'payload.png',
                mimeType: 'image/png',
                buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', 'utf8')
            }
        }
    });
    expect(activeMarkupUpload.status()).toBe(400);
    const activeMarkupPayload = await activeMarkupUpload.json() as { error?: string };
    expect(activeMarkupPayload.error || '').toContain('активный');
});

test('API guardrails: manager cannot create admin or read orders queue', async ({ request }) => {
    const manager = await login(request, MANAGER_EMAIL, DEFAULT_PASSWORD);

    const createAdminResponse = await request.post('/api/users', {
        headers: authHeaders(manager.accessToken),
        data: {
            name: 'Escalation Attempt',
            email: `guardrail-${Date.now()}@stones.test`,
            password: 'guardrail123',
            role: 'ADMIN'
        }
    });
    expect(createAdminResponse.status()).toBe(403);

    const ordersResponse = await request.get('/api/sales/orders', {
        headers: {
            Authorization: `Bearer ${manager.accessToken}`
        }
    });
    expect(ordersResponse.status()).toBe(403);

    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const createSalesManagerResponse = await request.post('/api/users', {
        headers: authHeaders(admin.accessToken),
        data: {
            name: 'Guardrail Sales',
            email: `sales-${Date.now()}@stones.test`,
            password: 'guardrail123',
            role: 'SALES_MANAGER'
        }
    });
    expect(createSalesManagerResponse.status()).toBe(201);
});
