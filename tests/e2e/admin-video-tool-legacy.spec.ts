import { expect, test } from '@playwright/test';
import { createProductFixture, disconnectTestDb, testDb } from './support/db-fixtures';
import {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    PARTNER_EMAIL,
    PARTNER_PASSWORD,
    authHeaders,
    buildManifest,
    createReceivedBatchWithSerials,
    login,
    makeFakeMp4,
    takeManifestPrefix,
    type VideoExportSessionPayload,
    type VideoToolPayload
} from './admin-video-tool.helpers';

test.afterAll(async () => {
    await disconnectTestDb();
});

test('API legacy: video export session enforces ACL, session lifecycle and duplicate upload idempotency', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const manifest = buildManifest(toolPayload);
    const partialManifest = takeManifestPrefix(manifest, 1);

    const partnerToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` }
    });
    expect(partnerToolResponse.status()).toBe(403);

    const createSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: partialManifest
        }
    });
    expect(createSessionResponse.status()).toBe(201);
    const createdSession = await createSessionResponse.json() as VideoExportSessionPayload;
    expect(createdSession.resumed).toBeFalsy();
    expect(createdSession.session.uploaded_count).toBe(0);

    const resumedSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: partialManifest
        }
    });
    expect(resumedSessionResponse.status()).toBe(200);
    const resumedSession = await resumedSessionResponse.json() as VideoExportSessionPayload;
    expect(resumedSession.resumed).toBeTruthy();
    expect(resumedSession.session.session_id).toBe(createdSession.session.session_id);

    await testDb.batchVideoExportSession.update({
        where: { id: createdSession.session.session_id },
        data: {
            status: 'OPEN',
            updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000)
        }
    });

    const abandonedToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(abandonedToolResponse.ok()).toBeTruthy();
    const abandonedToolPayload = await abandonedToolResponse.json() as VideoToolPayload & {
        batch: VideoToolPayload['batch'] & {
            video_export: { status: string } | null;
        };
    };
    expect(abandonedToolPayload.batch.video_export?.status).toBe('ABANDONED');

    const retryTailResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/retry-tail`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(retryTailResponse.ok()).toBeTruthy();
    const retryTailPayload = await retryTailResponse.json() as {
        session: { status: string };
        pending_serials: string[];
        recovered_stale: boolean;
    };
    expect(retryTailPayload.session.status).toBe('OPEN');
    expect(retryTailPayload.pending_serials).toHaveLength(1);
    expect(retryTailPayload.recovered_stale).toBeTruthy();

    const badCountResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count - 1,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'bad.mp4',
                size: 64,
                lastModified: 1,
                durationMs: 2000
            },
            render_manifest: partialManifest
        }
    });
    expect(badCountResponse.status()).toBe(400);

    const firstSerial = manifest.outputs[0].serial_number;
    const secondSerial = manifest.outputs[1].serial_number;

    const firstUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstSerial,
            file: {
                name: `${firstSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(firstSerial)
            }
        }
    });
    expect(firstUploadResponse.ok()).toBeTruthy();

    const duplicateUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstSerial,
            file: {
                name: `${firstSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(`${firstSerial}-duplicate`)
            }
        }
    });
    expect(duplicateUploadResponse.ok()).toBeTruthy();
    const duplicatePayload = await duplicateUploadResponse.json() as VideoExportSessionPayload;
    expect(duplicatePayload.duplicate).toBeTruthy();
    expect(duplicatePayload.session.uploaded_count).toBe(1);

    const appendSessionResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source.mp4',
                size: 128,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: manifest
        }
    });
    expect(appendSessionResponse.ok()).toBeTruthy();

    const secondUploadResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-sessions/${createdSession.session.session_id}/files`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: secondSerial,
            file: {
                name: `${secondSerial}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(secondSerial)
            }
        }
    });
    expect(secondUploadResponse.ok()).toBeTruthy();

    const completedToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(completedToolResponse.ok()).toBeTruthy();
    const completedToolPayload = await completedToolResponse.json() as VideoToolPayload;
    expect(completedToolPayload.items.every((item) => typeof item.item_video_url === 'string' && item.item_video_url.includes('/uploads/videos/exports/'))).toBeTruthy();
});

test('API legacy: video export plans support artifact replacement and skipped recovery before commit', async ({ request }) => {
    const admin = await login(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const partner = await login(request, PARTNER_EMAIL, PARTNER_PASSWORD);
    const { productId } = await createProductFixture({ isPublished: false });
    const toolPayload = await createReceivedBatchWithSerials(request, admin, partner, productId, 2);
    const manifest = buildManifest(toolPayload);
    const [firstOutput, secondOutput] = manifest.outputs;

    const createPlanResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans`, {
        headers: authHeaders(admin.accessToken),
        data: {
            expected_count: toolPayload.batch.expected_output_count,
            crossfade_ms: 200,
            source_fingerprint: {
                name: 'source-plan.mp4',
                size: 256,
                lastModified: 123456,
                durationMs: 3000
            },
            render_manifest: manifest
        }
    });
    expect(createPlanResponse.status()).toBe(201);
    const createdPlan = await createPlanResponse.json() as VideoExportSessionPayload;

    const firstArtifactResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans/${createdPlan.session.session_id}/artifacts`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstOutput.serial_number,
            file: {
                name: `${firstOutput.serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(`${firstOutput.serial_number}-v1`)
            }
        }
    });
    expect(firstArtifactResponse.ok()).toBeTruthy();

    const replaceArtifactResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans/${createdPlan.session.session_id}/artifacts`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: firstOutput.serial_number,
            file: {
                name: `${firstOutput.serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(`${firstOutput.serial_number}-v2`)
            }
        }
    });
    expect(replaceArtifactResponse.ok()).toBeTruthy();

    const skipArtifactResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans/${createdPlan.session.session_id}/skip`, {
        headers: authHeaders(admin.accessToken),
        data: { serial_number: secondOutput.serial_number }
    });
    expect(skipArtifactResponse.ok()).toBeTruthy();

    const restoreSkippedResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans/${createdPlan.session.session_id}/artifacts`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        multipart: {
            serial_number: secondOutput.serial_number,
            file: {
                name: `${secondOutput.serial_number}.mp4`,
                mimeType: 'video/mp4',
                buffer: makeFakeMp4(`${secondOutput.serial_number}-restored`)
            }
        }
    });
    expect(restoreSkippedResponse.ok()).toBeTruthy();

    const commitPlanResponse = await request.post(`/api/batches/${toolPayload.batch.id}/video-export-plans/${createdPlan.session.session_id}/commit`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(commitPlanResponse.ok()).toBeTruthy();

    const committedToolResponse = await request.get(`/api/batches/${toolPayload.batch.id}/video-tool`, {
        headers: { Authorization: `Bearer ${admin.accessToken}` }
    });
    expect(committedToolResponse.ok()).toBeTruthy();
    const committedToolPayload = await committedToolResponse.json() as VideoToolPayload;
    expect(committedToolPayload.items.every((item) => typeof item.item_video_url === 'string' && item.item_video_url.includes('/uploads/videos/exports/'))).toBeTruthy();
});
