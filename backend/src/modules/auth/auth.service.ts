import { prisma } from '../../config/database.config.js';
import { redis } from '../../config/redis.config.js';
import { hashPassword, comparePassword } from '../../utils/password.util.js';
import { generateTokens, verifyRefreshToken, AuthTokens } from '../../utils/token.util.js';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../errors/AppError.js';
import { RegisterInput, LoginInput } from './auth.validation.js';
import { dispatchEmail } from '../../queues/producer/email.queue.js';
import { logger } from '../../utils/logger.js';

/**
 * Authentication Business Logic Service.
 * 
 * Handles core identity lifecycles:
 * - User credential registration with salted bcrypt hashing.
 * - Identity verification and session creation.
 * - Refresh Token Rotation (RTR) to mitigate token theft attacks.
 * - Centralized token revocation via PostgreSQL persistence and Redis fast-path blacklisting.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/crud
 * @see https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation
 * @see https://redis.io/docs/latest/develop/data-types/strings/
 */
export class AuthService {
  /**
   * Register a new user account.
   * 
   * @param input - Validated registration parameters
   * @param deviceInfo - User-Agent header string
   * @param ipAddress - Client IP address
   * @returns User object and AuthTokens
   */
  async register(input: RegisterInput, deviceInfo?: string, ipAddress?: string) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
    });

    if (existingUser) {
      if (existingUser.email === input.email) {
        throw new ConflictError('User with this email already exists', 'auth.email_exists');
      }
      throw new ConflictError('User with this username already exists', 'auth.username_exists');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });

    // Enqueue welcome email in background BullMQ queue
    dispatchEmail({
      to: user.email,
      subject: 'Welcome to TalkChat!',
      template: 'WELCOME',
      context: {
        fullName: user.fullName || user.username,
        username: user.username,
      },
    }).catch((err) => {
      logger.warn({ err, userId: user.id }, 'Failed to enqueue welcome email');
    });

    const tokens = generateTokens({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    // Save refresh token in database (expires in 7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        deviceInfo,
        ipAddress,
        expiresAt,
      },
    });

    // Store active session in Redis for instant invalidation
    await redis.set(`session:${user.id}:${tokens.refreshToken}`, 'active', 'EX', 7 * 24 * 60 * 60);

    return { user, tokens };
  }

  /**
   * Authenticate a user by username or email.
   * 
   * @param input - Login credentials
   * @param deviceInfo - User-Agent header
   * @param ipAddress - Client IP address
   * @returns User profile and AuthTokens
   */
  async login(input: LoginInput, deviceInfo?: string, ipAddress?: string) {
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: input.login }, { username: input.login }],
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid credentials', 'auth.invalid_credentials');
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid credentials', 'auth.invalid_credentials');
    }

    const tokens = generateTokens({
      userId: user.id,
      username: user.username,
      email: user.email,
    });

    // Persist refresh token in PostgreSQL
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        deviceInfo,
        ipAddress,
        expiresAt,
      },
    });

    // Track session in Redis
    await redis.set(`session:${user.id}:${tokens.refreshToken}`, 'active', 'EX', 7 * 24 * 60 * 60);

    const safeUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
      createdAt: user.createdAt,
    };

    return { user: safeUser, tokens };
  }

  /**
   * Rotate a Refresh Token and issue a refreshed Access Token.
   * 
   * @param oldRefreshToken - The existing refresh token presented by the client
   * @param deviceInfo - User-Agent header
   * @param ipAddress - Client IP address
   * @returns New AuthTokens
   */
  async refreshToken(oldRefreshToken: string, deviceInfo?: string, ipAddress?: string): Promise<AuthTokens> {
    const decoded = verifyRefreshToken(oldRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token', 'auth.token_invalid');
    }

    // Revoke the old token (Refresh Token Rotation pattern)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });
    await redis.del(`session:${decoded.userId}:${oldRefreshToken}`);

    // Generate fresh tokens
    const tokens = generateTokens({
      userId: storedToken.user.id,
      username: storedToken.user.username,
      email: storedToken.user.email,
    });

    // Store new token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: tokens.refreshToken,
        deviceInfo,
        ipAddress,
        expiresAt,
      },
    });

    await redis.set(`session:${storedToken.user.id}:${tokens.refreshToken}`, 'active', 'EX', 7 * 24 * 60 * 60);

    return tokens;
  }

  /**
   * Invalidate tokens and terminate user session.
   * 
   * @param userId - ID of the authenticated user
   * @param refreshTokenStr - The refresh token to revoke
   * @param accessTokenStr - The access token to add to Redis blacklist
   */
  async logout(userId: string, refreshTokenStr?: string, accessTokenStr?: string): Promise<void> {
    if (refreshTokenStr) {
      await prisma.refreshToken.updateMany({
        where: { token: refreshTokenStr, userId },
        data: { isRevoked: true },
      });
      await redis.del(`session:${userId}:${refreshTokenStr}`);
    }

    if (accessTokenStr) {
      // Blacklist access token for 15 minutes (its max lifespan)
      await redis.set(`blacklist:${accessTokenStr}`, 'revoked', 'EX', 15 * 60);
    }
  }

  /**
   * Retrieve the authenticated user's profile.
   * 
   * @param userId - Unique user UUID
   */
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found', 'errors.not_found');
    }

    return user;
  }
}

export const authService = new AuthService();
