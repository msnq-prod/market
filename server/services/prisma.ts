import { PrismaClient } from '@prisma/client';
import { LOG_SLOW_QUERY_MS } from '../config/env.ts';
import { getLogger, getProcessLogService, logDomainEvent, sanitizeForLog } from './logger.ts';

export const prisma = new PrismaClient({
    log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' }
    ]
});

prisma.$on('query', (event) => {
    getLogger(getProcessLogService(), { component: 'prisma' }).info({
        event: event.duration >= LOG_SLOW_QUERY_MS ? 'db-query-slow' : 'db-query',
        duration_ms: event.duration,
        target: event.target,
        query: sanitizeForLog(event.query)
    }, 'Prisma query');
});

prisma.$on('warn', (event) => {
    getLogger(getProcessLogService(), { component: 'prisma' }).warn({
        event: 'db-warn',
        target: event.target,
        message: event.message
    }, 'Prisma warning');
});

prisma.$on('error', (event) => {
    getLogger(getProcessLogService(), { component: 'prisma' }).error({
        event: 'db-error',
        target: event.target,
        message: event.message
    }, 'Prisma error');
});

prisma.$use(async (params, next) => {
    const startedAt = Date.now();

    try {
        const result = await next(params);
        logDomainEvent('api', 'db-operation', {
            model: params.model,
            action: params.action,
            duration_ms: Date.now() - startedAt
        }, 'debug');
        return result;
    } catch (error) {
        getLogger(getProcessLogService(), { component: 'prisma' }).error({
            event: 'db-operation-error',
            model: params.model,
            action: params.action,
            duration_ms: Date.now() - startedAt,
            error: sanitizeForLog(error)
        }, 'Prisma operation failed');
        throw error;
    }
});
