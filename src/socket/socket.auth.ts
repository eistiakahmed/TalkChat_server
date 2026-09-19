import { Socket } from 'socket.io';
import { verifyAccessToken, TokenPayload } from '../utils/token.util.js';
import { redis } from '../config/redis.config.js';
import { logger } from '../utils/logger.js';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: TokenPayload;
    userId: string;
  };
}

/**
 * Socket.io Handshake Authentication Middleware.
 * 
 * Intercepts incoming WebSocket connection handshakes to verify identity:
 * 1. Extracts JWT bearer token from `handshake.auth.token` or `handshake.headers.authorization`.
 * 2. Validates against Redis distributed token blacklist to reject revoked tokens immediately.
 * 3. Cryptographically verifies JWT signature and expiry.
 * 4. Injects validated user identity onto `socket.data.user` and `socket.data.userId`.
 * 
 * @param socket - Incoming Socket.io connection instance
 * @param next - Namespace next handler
 * 
 * @see https://socket.io/docs/v4/middlewares/#handling-cors-and-other-headers
 * @see https://datatracker.ietf.org/doc/html/rfc7519
 * @see https://redis.io/commands/get/
 */
export const socketAuthMiddleware = async (
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> => {
  try {
    const rawToken =
      (socket.handshake.auth?.token as string | undefined) ||
      (socket.handshake.headers?.authorization as string | undefined);

    if (!rawToken) {
      logger.warn({ socketId: socket.id }, 'Socket handshake rejected: missing token');
      return next(new Error('Authentication error: Token required'));
    }

    const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();

    if (!token) {
      return next(new Error('Authentication error: Token malformed'));
    }

    // Check Redis token revocation blacklist
    const isRevoked = await redis.get(`blacklist:${token}`);
    if (isRevoked) {
      logger.warn({ socketId: socket.id }, 'Socket handshake rejected: token revoked');
      return next(new Error('Authentication error: Token has been revoked'));
    }

    // Verify token validity
    const decoded = verifyAccessToken(token);

    // Attach authenticated identity to socket instance
    socket.data.user = decoded;
    socket.data.userId = decoded.userId;

    next();
  } catch (error: any) {
    logger.warn({ socketId: socket.id, error: error.message }, 'Socket authentication failed');
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Authentication error: Token expired'));
    }
    return next(new Error('Authentication error: Invalid credentials'));
  }
};
