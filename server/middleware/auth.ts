import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_SECRET } from '../config/env.ts';
import type { UserRole } from '../../shared/domain/policy.ts';
import { assignLogContext, logDomainEvent } from '../services/logger.ts';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: UserRole | string;
    };
    requestId?: string;
    traceId?: string;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        logDomainEvent('api', 'auth-missing-token', {
            route: req.originalUrl,
            method: req.method
        }, 'warn');
        return res.sendStatus(401);
    }

    jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) {
            logDomainEvent('api', 'auth-invalid-token', {
                route: req.originalUrl,
                method: req.method,
                reason: err.message
            }, 'warn');
            return res.sendStatus(401);
        }
        if (!user || typeof user !== 'object') {
            logDomainEvent('api', 'auth-invalid-payload', {
                route: req.originalUrl,
                method: req.method
            }, 'warn');
            return res.sendStatus(401);
        }

        const payload = user as { id?: string; role?: string };
        if (!payload.id || !payload.role) {
            logDomainEvent('api', 'auth-incomplete-payload', {
                route: req.originalUrl,
                method: req.method
            }, 'warn');
            return res.sendStatus(401);
        }

        req.user = { id: payload.id, role: payload.role };
        assignLogContext({
            user_id: payload.id,
            role: payload.role
        });
        next();
    });
};

export const requireRole = (roles: readonly string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        if (!req.user) return res.sendStatus(401);
        if (!roles.includes(req.user.role)) {
            logDomainEvent('api', 'acl-deny', {
                route: req.originalUrl,
                method: req.method,
                user_id: req.user.id,
                role: req.user.role,
                required_roles: roles
            }, 'warn');
            return res.sendStatus(403);
        }
        next();
    };
};
