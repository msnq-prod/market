import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';

export type LoginPayload = {
    accessToken: string;
    role: string;
    name: string;
};

export type VideoToolPayload = {
    batch: {
        id: string;
        status: string;
        expected_output_count: number;
    };
    items: Array<{
        id: string;
        serial_number: string | null;
        item_video_url: string | null;
    }>;
};

export const ADMIN_EMAIL = 'admin@stones.com';
export const ADMIN_PASSWORD = 'admin123';
export const PARTNER_EMAIL = 'yakutia.partner@stones.com';
export const PARTNER_PASSWORD = 'Partner123';
export const E2E_REQUEST_NOTE = '[e2e] admin-video-tool-v3';

export const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
});

export async function login(request: APIRequestContext, email: string, password: string): Promise<LoginPayload> {
    const response = await request.post('/auth/login', {
        data: { email, password }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json() as LoginPayload;
}

export async function createReceivedBatchWithSerials(
    request: APIRequestContext,
    admin: LoginPayload,
    partner: LoginPayload,
    productId: string,
    itemCount: number
): Promise<VideoToolPayload> {
    const createRequestResponse = await request.post('/api/collection-requests', {
        headers: authHeaders(admin.accessToken),
        data: {
            product_id: productId,
            requested_qty: itemCount,
            note: E2E_REQUEST_NOTE
        }
    });
    expect(createRequestResponse.ok()).toBeTruthy();
    const createdRequest = await createRequestResponse.json() as { id: string };

    const ackResponse = await request.post(`/api/collection-requests/${createdRequest.id}/ack`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(ackResponse.ok()).toBeTruthy();

    const completeResponse = await request.post(`/api/collection-requests/${createdRequest.id}/complete`, {
        headers: authHeaders(partner.accessToken),
        data: {
            gps_lat: 55.75,
            gps_lng: 37.61,
            collected_date: '2026-04-06',
            collected_time: '12:00'
        }
    });
    expect(completeResponse.ok()).toBeTruthy();
    const completed = await completeResponse.json() as {
        batch: { id: string };
    };

    const receiveResponse = await request.post(`/api/batches/${completed.batch.id}/receive`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(receiveResponse.ok()).toBeTruthy();

    const toolResponse = await request.get(`/api/video-tool-v3/batches/${completed.batch.id}`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(toolResponse.ok()).toBeTruthy();
    return await toolResponse.json() as VideoToolPayload;
}
