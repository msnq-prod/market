import test from 'node:test';
import assert from 'node:assert/strict';
import { assignLogContext, generateRequestId, getLogContext, isRedactedValue, runWithLogContext, sanitizeForLog } from '../../server/services/logger.ts';

test('sanitizeForLog redacts secrets and omits binary payloads', () => {
    const payload = sanitizeForLog({
        authorization: 'Bearer secret-token',
        nested: {
            password: 'plain-text-password',
            image: 'data:image/png;base64,AAAA'
        }
    }) as {
        authorization: unknown;
        nested: {
            password: unknown;
            image: unknown;
        };
    };

    assert.equal(isRedactedValue(payload.authorization), true);
    assert.equal(isRedactedValue(payload.nested.password), true);
    assert.equal(payload.nested.image, '[OMITTED]');
});

test('runWithLogContext propagates and updates request context', () => {
    const requestId = generateRequestId();

    runWithLogContext({ request_id: requestId, route: '/healthz' }, () => {
        assert.equal(getLogContext().request_id, requestId);
        assert.equal(getLogContext().route, '/healthz');

        assignLogContext({ user_id: 'user-1', role: 'ADMIN' });

        assert.equal(getLogContext().user_id, 'user-1');
        assert.equal(getLogContext().role, 'ADMIN');
    });

    assert.equal(getLogContext().request_id, undefined);
});
