import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors/AppError.js';
import { verifyAccessToken } from '../utils/token.util.js';
import { redis } from '../config/redis.config.js';
import { logger } from '../utils/logger.js';

/**
 * JWT Authentication Middleware Guard.
 * 
 * Verifies the `Authorization: Bearer <token>` header on protected HTTP endpoints:
 * 1. Extracts the token adhering to RFC 6750 Bearer Token specification.
 * 2. Queries Redis to verify that the token has not been revoked or blacklisted (e.g. following a logout).
 * 3. Validates the signature and expiration using `jsonwebtoken`.
 * 4. Injects `req.userId` and `req.user` onto the Express Request context for downstream controllers.
 * 
 * @see https://datatracker.ietf.org/doc/html/rfc6750
 * @see https://datatracker.ietf.org/doc/html/rfc7519
 * @see https://redis.io/commands/get/
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or invalid format', 'errors.unauthorized');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token missing', 'errors.unauthorized');
    }

    // Check Redis token blacklist
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked', 'errors.unauthorized');
    }

    // Verify token cryptographic signature
    const decoded = verifyAccessToken(token);

    // Attach user identifier to request context
    req.userId = decoded.userId;

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token has expired', 'auth.token_expired'));
      return;
    }

    if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token signature', 'auth.token_invalid'));
      return;
    }

    logger.error({ error }, 'Authentication middleware error');
    next(error);
  }
};
