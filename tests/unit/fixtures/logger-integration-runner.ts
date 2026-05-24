import { EventEmitter } from 'node:events';
import { createRequestLoggingMiddleware, initServerObservability, logDomainEvent } from '../../../server/services/logger.ts';

class MockResponse extends EventEmitter {
    statusCode = 200;

    setHeader(_name: string, _value: string) {
        return this;
    }

    json(_body: unknown) {
        return this;
    }

    send(_body: unknown) {
        return this;
    }
}

initServerObservability('api');

const middleware = createRequestLoggingMiddleware('api');
const response = new MockResponse();
const req = {
    headers: {
        'x-request-id': 'test-request-id-1'
    },
    method: 'GET',
    originalUrl: '/integration-test',
    query: {},
    params: {},
    body: undefined
};

middleware(req as never, response as never, () => {
    logDomainEvent('api', 'db-query', {
        query: 'SELECT 1'
    });
    response.json({ ok: true });
    response.emit('finish');
});

await new Promise((resolve) => setTimeout(resolve, 25));
