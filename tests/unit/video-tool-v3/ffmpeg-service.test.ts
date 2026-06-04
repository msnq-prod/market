import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { resolveBinaryPath } = require('../../../electron/hq/videoToolV3/ffmpegService.cjs');

test('resolveBinaryPath prefers app.asar.unpacked for packaged Electron binaries', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'stones-video-v3-ffmpeg-'));
    try {
        const packedPath = path.join(root, 'App.app', 'Contents', 'Resources', 'app.asar', 'node_modules', 'ffmpeg-static', 'ffmpeg');
        const unpackedPath = packedPath.replace('app.asar', 'app.asar.unpacked');
        mkdirSync(path.dirname(unpackedPath), { recursive: true });
        writeFileSync(unpackedPath, '');

        assert.equal(resolveBinaryPath(packedPath, 'ffmpeg'), unpackedPath);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
