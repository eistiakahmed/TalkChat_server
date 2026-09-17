import { Server } from 'socket.io';
import { redis } from '../config/redis.config.js';
import { prisma } from '../config/database.config.js';
import { logger } from '../utils/logger.js';
import { SocketEvents } from '../constants/socketEvents.js';

/**
 * Distributed User Presence Tracker.
 * 
 * Tracks online and offline status across distributed server nodes using Redis sets:
 * - `online_users`: Global set of active user IDs.
 * - `user:sockets:{userId}`: Set of active Socket IDs associated with a specific user account.
 * 
 * Handles multi-device/multi-tab synchronization:
 * - A user is considered ONLINE as long as at least 1 socket is active.
 * - A user transitions to OFFLINE only when their last remaining socket disconnects.
 * 
 * @see https://redis.io/commands/sadd/
 * @see https://redis.io/commands/srem/
 * @see https://redis.io/commands/scard/
 */
export class PresenceTracker {
  /**
   * Handle user socket connection and update presence status.
   * 
   * @param io - Socket.io Server instance
   * @param userId - Connected user UUID
   * @param socketId - Connected socket client identifier
   */
  async handleUserConnect(io: Server, userId: string, socketId: string): Promise<void> {
    try {
      const userSocketsKey = `user:sockets:${userId}`;
      await redis.sadd(userSocketsKey, socketId);
      await redis.sadd('online_users', userId);

      const activeSocketsCount = await redis.scard(userSocketsKey);

      // If this is the user's first active connection, transition status to ONLINE
      if (activeSocketsCount === 1) {
        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: true },
        }).catch((err) => {
          logger.error({ err, userId }, 'Failed to persist user isOnline state in DB');
        });

        // Broadcast presence change to all connected clients
        io.emit(SocketEvents.USER_ONLINE, {
          userId,
          isOnline: true,
        });

        logger.info({ userId, socketId }, 'User presence transitioned to ONLINE');
      }
    } catch (error) {
      logger.error({ error, userId, socketId }, 'Error handling socket connect presence');
    }
  }

  /**
   * Handle socket disconnection and update presence status.
   * 
   * @param io - Socket.io Server instance
   * @param userId - Disconnected user UUID
   * @param socketId - Disconnected socket client identifier
   */
  async handleUserDisconnect(io: Server, userId: string, socketId: string): Promise<void> {
    try {
      const userSocketsKey = `user:sockets:${userId}`;
      await redis.srem(userSocketsKey, socketId);

      const remainingSockets = await redis.scard(userSocketsKey);

      // If no active sockets remain for this user, transition status to OFFLINE
      if (remainingSockets === 0) {
        await redis.srem('online_users', userId);
        const lastSeen = new Date();

        await prisma.user.update({
          where: { id: userId },
          data: {
            isOnline: false,
            lastSeen,
          },
        }).catch((err) => {
          logger.error({ err, userId }, 'Failed to persist user isOffline state in DB');
        });

        // Broadcast presence change to all connected clients
        io.emit(SocketEvents.USER_OFFLINE, {
          userId,
          isOnline: false,
          lastSeen: lastSeen.toISOString(),
        });

        logger.info({ userId, socketId }, 'User presence transitioned to OFFLINE');
      }
    } catch (error) {
      logger.error({ error, userId, socketId }, 'Error handling socket disconnect presence');
    }
  }

  /**
   * Check if a specific user is currently online.
   * 
   * @param userId - Target user UUID
   * @returns Boolean indicating presence status
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const isMember = await redis.sismember('online_users', userId);
    return isMember === 1;
  }

  /**
   * Retrieve all currently online user IDs.
   * 
   * @returns Array of online user UUIDs
   */
  async getOnlineUsers(): Promise<string[]> {
    return redis.smembers('online_users');
  }
}

export const presenceTracker = new PresenceTracker();
