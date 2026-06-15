import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
    cleanupSharedUploadedFiles,
    createSharedUpload
} from '../../server/middleware/upload.ts';

const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==',
    'base64'
);

test('createSharedUpload allows route-specific file count limits', async () => {
    const app = express();
    const upload = createSharedUpload({ maxFiles: 101 });

    app.post('/upload', (req, res) => {
        upload.array('files')(req, res, async (error) => {
            if (error) {
                res.status(400).json({ error: error instanceof Error ? error.message : 'upload failed' });
                return;
            }

            const files = (req.files as Express.Multer.File[] | undefined) ?? [];
            await cleanupSharedUploadedFiles(files);
            res.json({ count: files.length });
        });
    });

    const server = http.createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    try {
        const address = server.address();
        assert(address && typeof address === 'object');

        const body = new FormData();
        for (let index = 0; index < 101; index += 1) {
            body.append('files', new Blob([TINY_PNG], { type: 'image/png' }), `file-${index + 1}.png`);
        }

        const response = await fetch(`http://127.0.0.1:${address.port}/upload`, {
            method: 'POST',
            body
        });
        const payload = await response.json() as { count: number };

        assert.equal(response.status, 200);
        assert.equal(payload.count, 101);
    } finally {
        server.close();
        await once(server, 'close');
    }
});
