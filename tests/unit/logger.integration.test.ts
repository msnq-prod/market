import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('request logging chain keeps one request_id across request-start, domain-event and request-finish', async () => {
    const { stdout } = await execFileAsync(process.execPath, [
        '--import',
        'tsx',
        'tests/unit/fixtures/logger-integration-runner.ts'
    ], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'test-access-secret',
            REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret',
            TELEGRAM_TOKEN_ENCRYPTION_KEY: process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY || '12345678901234567890123456789012',
            LOG_PRETTY: '0'
        }
    });

    const lines = stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim().startsWith('{'))
        .map((line) => JSON.parse(line) as { event?: string; request_id?: string });

    const relevant = lines.filter((line) => ['request-start', 'db-query', 'request-finish'].includes(line.event || ''));
    assert.equal(relevant.length, 3);
    assert.deepEqual(relevant.map((line) => line.event), ['request-start', 'db-query', 'request-finish']);
    assert.ok(relevant.every((line) => line.request_id === 'test-request-id-1'));
});
